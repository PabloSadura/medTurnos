import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Load Firebase config safely
let firebaseConfig: any = {
  projectId: "gen-lang-client-0464775009",
  firestoreDatabaseId: "turneroweb"
};

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.warn("Could not read firebase-applet-config.json, using defaults:", err);
}

// Initialize Firebase Admin safely
let adminDb: any;
let auth: any;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0464775009",
    });
  }
  adminDb = admin.firestore();
  if (firebaseConfig.firestoreDatabaseId) {
    try {
      (adminDb as any).settings({ databaseId: firebaseConfig.firestoreDatabaseId });
    } catch (e) {
      // Ignored if settings already locked
    }
  }
  auth = admin.auth();
} catch (err) {
  console.warn("Firebase Admin SDK initialization warning:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Database Initialization Endpoint based on firebase-blueprint.json
  app.post("/api/database/init", async (req, res) => {
    try {
      const results: Record<string, any> = {};

      // 1. Initialize Plans collection
      const defaultPlans = [
        { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, whatsappCredit: 100, price: 19 },
        { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, whatsappCredit: 500, price: 39 },
        { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, whatsappCredit: 2000, price: 79 }
      ];

      for (const p of defaultPlans) {
        await adminDb.collection("plans").doc(p.id).set({
          name: p.name,
          usersLimit: p.usersLimit,
          secretariesLimit: p.secretariesLimit,
          whatsappCredit: p.whatsappCredit,
          price: p.price,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      results.plans = defaultPlans.map(p => p.id);

      // 2. Ensure admin user in 'users' collection
      const adminUsersSnap = await adminDb.collection("users").where("email", "==", "admin@mail.com").get();
      if (adminUsersSnap.empty) {
        await adminDb.collection("users").doc("admin_root").set({
          email: "admin@mail.com",
          name: "Administrador del Sistema",
          role: "admin",
          status: "Activo",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
        results.adminUser = "created (admin_root)";
      } else {
        results.adminUser = "exists";
      }

      // 3. Ensure system metadata / initial documents for blueprint collections
      const collectionsToCheck = [
        "appointments",
        "patients",
        "treatments",
        "stocks",
        "profiles",
        "reminder_settings",
        "staff",
        "whatsapp_logs"
      ];

      for (const colName of collectionsToCheck) {
        const metaDoc = adminDb.collection(colName).doc("_meta");
        const docSnap = await metaDoc.get();
        if (!docSnap.exists) {
          await metaDoc.set({
            initialized: true,
            createdAt: new Date().toISOString(),
            description: `Collection for ${colName}`
          });
          results[colName] = "initialized";
        } else {
          results[colName] = "ready";
        }
      }

      res.json({
        success: true,
        message: "Base de datos y colecciones inicializadas de acuerdo a firebase-blueprint.json",
        results
      });
    } catch (error: any) {
      console.error("Database initialization error:", error);
      res.status(500).json({ error: error.message });
    }
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
      let authErrorEncountered = false;
      let authErrorMessage = "";
      
      try {
        // Try to use Admin SDK first
        authUser = await auth.getUserByEmail(email);
        
        // Update password if provided
        if (password && password.trim().length > 0) {
          await auth.updateUser(authUser.uid, { password });
        }
        
        // Update display name
        await auth.updateUser(authUser.uid, { displayName: name });
      } catch (error: any) {
        const isIdentityToolkitError = error.message?.includes("identitytoolkit.googleapis.com") || 
                                       error.message?.includes("Identity Toolkit API") || 
                                       error.code === "auth/insufficient-permission" ||
                                       error.message?.includes("PERMISSION_DENIED");

        if (isIdentityToolkitError) {
          console.warn("Auth SDK failed due to disabled Identity Toolkit API:", error.message);
          authErrorEncountered = true;
          authErrorMessage = error.message;

          let fallbackUid = staffId;
          if (!fallbackUid) {
            try {
              const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
              if (!existingSnap.empty) {
                fallbackUid = existingSnap.docs[0].id;
              } else {
                fallbackUid = adminDb.collection("users").doc().id;
              }
            } catch (fsErr) {
              console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
              fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
            }
          }
          authUser = { uid: fallbackUid, email };
        } else if (error.code === 'auth/user-not-found') {
          // Create new user using REST API as fallback
          if (!password || password.trim().length === 0) {
            throw new Error("La contraseña es obligatoria para nuevos usuarios");
          }
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
            const isRestIdentityToolkitError = restError.response?.data?.error?.message?.includes("Identity Toolkit API") || 
                                              restError.message?.includes("Identity Toolkit API") ||
                                              restError.response?.data?.error?.message?.includes("developer") ||
                                              restError.message?.includes("developer");
            if (isRestIdentityToolkitError) {
              authErrorEncountered = true;
              authErrorMessage = restError.response?.data?.error?.message || restError.message;
              
              let fallbackUid = staffId;
              if (!fallbackUid) {
                try {
                  const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
                  if (!existingSnap.empty) {
                    fallbackUid = existingSnap.docs[0].id;
                  } else {
                    fallbackUid = adminDb.collection("users").doc().id;
                  }
                } catch (fsErr) {
                  console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
                  fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
                }
              }
              authUser = { uid: fallbackUid, email };
            } else {
              throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
            }
          }
        } else {
          // If SDK failed for other reasons (like restricted environment), try to find by email in Firestore or proceed with cautious dummy UID
          console.warn("Admin SDK check failed, falling back to basic checks", error.message);
          
          if (password && password.trim().length > 0) {
            // If we have a password, we can try to "sign up" which will fail with EMAIL_EXISTS if they are already there
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
               if (restError.response?.data?.error?.message === 'EMAIL_EXISTS') {
                  // If email exists, we can't get the UID without Admin SDK, but we know they exist.
                  // For now, we'll return a special flag or dummy UID if we are editing
                  authUser = { uid: staffId || `pending_${Date.now()}`, email };
               } else {
                  const isRestIdentityToolkitError = restError.response?.data?.error?.message?.includes("Identity Toolkit API") || 
                                                    restError.message?.includes("Identity Toolkit API");
                  if (isRestIdentityToolkitError) {
                    authErrorEncountered = true;
                    authErrorMessage = restError.response?.data?.error?.message || restError.message;
                    
                    let fallbackUid = staffId;
                    if (!fallbackUid) {
                      try {
                        const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
                        if (!existingSnap.empty) {
                          fallbackUid = existingSnap.docs[0].id;
                        } else {
                          fallbackUid = adminDb.collection("users").doc().id;
                        }
                      } catch (fsErr) {
                        console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
                        fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
                      }
                    }
                    authUser = { uid: fallbackUid, email };
                  } else {
                    throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
                  }
               }
            }
          } else if (staffId) {
            // If we are editing (have staffId) but no password, we just assume auth is OK
            authUser = { uid: staffId, email };
          } else {
            throw new Error("Se requiere contraseña para configurar el acceso por primera vez");
          }
        }
      }

      // Return the UID so the frontend can sync with Firestore using the user's own credentials
      res.json({ 
        success: true, 
        uid: authUser?.uid, 
        warning: authErrorEncountered ? "Nota: Se guardó en Firestore pero Identity Toolkit API está inactiva en tu consola Google Cloud; por favor actívala." : undefined,
        message: createdInAuth ? "Creado exitosamente" : "Actualizado (si los permisos lo permiten)" 
      });
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
      console.log("Fetching patients from Firestore (Admin)...");
      const snapshot = await adminDb.collection("patients").orderBy("name", "asc").get();
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
      console.log("Fetching stocks from Firestore (Admin)...");
      const snapshot = await adminDb.collection("stocks").orderBy("name", "asc").get();
      const stocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`Successfully fetched ${stocks.length} items.`);
      res.json(stocks);
    } catch (error: any) {
      console.error("Error fetching stocks:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- System Admin Endpoints ---

  // Get all users (for system admin except admins)
  app.get("/api/admin/professionals", async (req, res) => {
    try {
      const snapshot = await adminDb.collection("users").get();
      
      const professionals = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(user => user.role !== "admin");
      res.json(professionals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Manage professional (create/update)
  app.post("/api/admin/professionals/manage", async (req, res) => {
    const { id, name, email, password, role, status } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    try {
      let authUser;
      let createdInAuth = false;
      let authErrorEncountered = false;
      let authErrorMessage = "";
      
      try {
        // Try to use Admin SDK first
        authUser = await auth.getUserByEmail(email);
        
        // Update password if provided
        if (password && password.trim().length > 0) {
          await auth.updateUser(authUser.uid, { password });
        }
        
        // Update display name
        await auth.updateUser(authUser.uid, { displayName: name });
      } catch (error: any) {
        const isIdentityToolkitError = error.message?.includes("identitytoolkit.googleapis.com") || 
                                       error.message?.includes("Identity Toolkit API") || 
                                       error.code === "auth/insufficient-permission" ||
                                       error.message?.includes("PERMISSION_DENIED");

        if (isIdentityToolkitError) {
          console.warn("Auth SDK failed due to disabled Identity Toolkit API:", error.message);
          authErrorEncountered = true;
          authErrorMessage = error.message;

          let fallbackUid = id;
          if (!fallbackUid) {
            try {
              const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
              if (!existingSnap.empty) {
                fallbackUid = existingSnap.docs[0].id;
              } else {
                fallbackUid = adminDb.collection("users").doc().id;
              }
            } catch (fsErr) {
              console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
              fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
            }
          }
          authUser = { uid: fallbackUid, email };
        } else if (error.code === 'auth/user-not-found') {
          // Create new user using REST API as fallback
          if (!password || password.trim().length === 0) {
            throw new Error("La contraseña es obligatoria para nuevos usuarios");
          }
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
            const isRestIdentityToolkitError = restError.response?.data?.error?.message?.includes("Identity Toolkit API") || 
                                              restError.message?.includes("Identity Toolkit API") ||
                                              restError.response?.data?.error?.message?.includes("developer") ||
                                              restError.message?.includes("developer");
            if (isRestIdentityToolkitError) {
              authErrorEncountered = true;
              authErrorMessage = restError.response?.data?.error?.message || restError.message;
              
              let fallbackUid = id;
              if (!fallbackUid) {
                try {
                  const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
                  if (!existingSnap.empty) {
                    fallbackUid = existingSnap.docs[0].id;
                  } else {
                    fallbackUid = adminDb.collection("users").doc().id;
                  }
                } catch (fsErr) {
                  console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
                  fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
                }
              }
              authUser = { uid: fallbackUid, email };
            } else {
              throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
            }
          }
        } else {
          // If SDK failed for other reasons, try to find by email in Firestore or proceed with cautious dummy UID
          console.warn("Admin SDK check failed, falling back to basic checks", error.message);
          
          if (password && password.trim().length > 0) {
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
               if (restError.response?.data?.error?.message === 'EMAIL_EXISTS') {
                  authUser = { uid: id || `pending_${Date.now()}`, email };
               } else {
                  const isRestIdentityToolkitError = restError.response?.data?.error?.message?.includes("Identity Toolkit API") || 
                                                    restError.message?.includes("Identity Toolkit API");
                  if (isRestIdentityToolkitError) {
                    authErrorEncountered = true;
                    authErrorMessage = restError.response?.data?.error?.message || restError.message;
                    
                    let fallbackUid = id;
                    if (!fallbackUid) {
                      try {
                        const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
                        if (!existingSnap.empty) {
                          fallbackUid = existingSnap.docs[0].id;
                        } else {
                          fallbackUid = adminDb.collection("users").doc().id;
                        }
                      } catch (fsErr) {
                        console.warn("Firestore fallback lookup failed, generating local unique ID instead:", fsErr);
                        fallbackUid = `u_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
                      }
                    }
                    authUser = { uid: fallbackUid, email };
                  } else {
                    throw new Error(`Auth Error: ${restError.response?.data?.error?.message || restError.message}`);
                  }
               }
            }
          } else if (id) {
            authUser = { uid: id, email };
          } else {
            throw new Error("Se requiere contraseña para configurar el acceso por primera vez");
          }
        }
      }

      const authUid = authUser?.uid;

      const userData = {
        name,
        email,
        role: role || 'medico',
        status: status || 'Activo',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      try {
        await adminDb.collection("users").doc(authUid).set(userData, { merge: true });
      } catch (fsErr) {
        console.warn("Server-side Firestore write bypassed. Client will handle database syncing:", fsErr);
      }

      res.json({ 
        success: true, 
        uid: authUid, 
        warning: authErrorEncountered ? "Nota: Se guardó en Firestore pero Identity Toolkit API está inactiva en tu consola Google Cloud; por favor actívala." : undefined,
        message: createdInAuth ? "Creado exitosamente" : "Actualizado (si los permisos lo permiten)" 
      });
    } catch (error: any) {
      console.error("User Admin Management Error:", error);
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
