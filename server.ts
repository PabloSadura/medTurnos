import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, doc, setDoc, serverTimestamp } from "firebase/firestore";
import admin from "firebase-admin";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Load Firebase config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Client Firebase (for some server-side firestore calls if needed, though admin is better)
const firebaseApp = initializeClientApp(firebaseConfig);
const clientDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminDb = admin.firestore();
const auth = admin.auth();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // User Management API
  app.post("/api/staff/manage", async (req, res) => {
    const { email, password, name, role, permissions, status, userId, staffId } = req.body;

    if (!email || !name || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      let authUser;
      let createdInAuth = false;
      
      try {
        // Try to use Admin SDK first
        authUser = await auth.getUserByEmail(email);
        
        // Update password if provided
        if (password) {
          await auth.updateUser(authUser.uid, { password });
        }
        
        // Update display name
        await auth.updateUser(authUser.uid, { displayName: name });
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          // Create new user using REST API as fallback (more likely to work with API Key in restricted environments)
          try {
            const signupResponse = await axios.post(
              `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
              {
                email,
                password,
                displayName: name,
                returnSecureToken: true
              }
            );
            authUser = { uid: signupResponse.data.localId, email };
            createdInAuth = true;
          } catch (restError: any) {
            console.error("REST Auth Error:", restError.response?.data || restError.message);
            // If REST also fails, we might still want to try creating the record in Firestore but warn the user
            throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
          }
        } else if (error.message.includes('Identity Toolkit API') || error.code === 'auth/internal-error') {
          // Fallback to REST API for creation even if admin check failed
          try {
            const signupResponse = await axios.post(
              `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
              {
                email,
                password,
                displayName: name,
                returnSecureToken: true
              }
            );
            authUser = { uid: signupResponse.data.localId, email };
            createdInAuth = true;
          } catch (restError: any) {
             // If it fails with EMAIL_EXISTS, and we got here because admin was disabled, we can't update it but we know it exists
             if (restError.response?.data?.error?.message === 'EMAIL_EXISTS') {
                // We can't get the UID without Admin SDK if API is disabled
                // We'll proceed with a dummy UID or search by email in Firestore
                authUser = { uid: `pending_${Date.now()}`, email };
             } else {
                throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
             }
          }
        } else {
          throw error;
        }
      }

      // Sync with Firestore staff collection
      const staffData: any = {
        name,
        email,
        role,
        permissions,
        status,
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (authUser?.uid) {
        staffData.authUid = authUser.uid;
      }

      if (staffId) {
        await adminDb.collection('staff').doc(staffId).update(staffData);
      } else {
        await adminDb.collection('staff').add({
          ...staffData,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      res.json({ success: true, uid: authUser?.uid, message: createdInAuth ? "Creado exitosamente" : "Actualizado (si los permisos lo permiten)" });
    } catch (error: any) {
      console.error("User Management Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Send Message
  app.post("/api/whatsapp/send", async (req, res) => {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: "Missing 'to' or 'message' in request body" });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.warn("WhatsApp API credentials not configured in environment.");
      return res.status(503).json({ error: "WhatsApp integration not configured" });
    }

    try {
      // Clean phone number: remove non-digits
      const cleanPhone = to.replace(/\D/g, "");
      
      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: message
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      res.json({ success: true, data: response.data });
    } catch (error: any) {
      console.error("WhatsApp API Error:", error.response?.data || error.message);
      res.status(500).json({ 
        error: "Failed to send WhatsApp message", 
        details: error.response?.data || error.message 
      });
    }
  });

  // Get Patients
  app.get("/api/patients", async (req, res) => {
    try {
      console.log("Fetching patients from Firestore...");
      const q = query(collection(clientDb, "patients"), orderBy("name", "asc"));
      const snapshot = await getDocs(q);
      const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`Successfully fetched ${patients.length} patients.`);
      res.json(patients);
    } catch (error: any) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Stocks
  app.get("/api/stocks", async (req, res) => {
    try {
      console.log("Fetching stocks from Firestore...");
      const q = query(collection(clientDb, "stocks"), orderBy("name", "asc"));
      const snapshot = await getDocs(q);
      const stocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`Successfully fetched ${stocks.length} items.`);
      res.json(stocks);
    } catch (error: any) {
      console.error("Error fetching stocks:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
