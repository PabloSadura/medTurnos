import express from "express";
import path from "path";
import admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
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

// Initialize Firebase Admin safely with lazy initialization
let adminDbInstance: any = null;
let authInstance: any = null;

function getFirebaseAdmin() {
  if (!adminDbInstance || !authInstance) {
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0464775009",
        });
      }
      if (!adminDbInstance) {
        const dbId = firebaseConfig.firestoreDatabaseId || "turneroweb";
        try {
          adminDbInstance = getAdminFirestore(admin.app(), dbId);
          console.log(`[Firebase Admin] Successfully connected to database: ${dbId}`);
        } catch (dbErr) {
          console.warn(`[Firebase Admin] getAdminFirestore(${dbId}) failed, falling back to default:`, dbErr);
          adminDbInstance = admin.firestore();
        }
      }
      if (!authInstance) {
        authInstance = admin.auth();
      }
    } catch (err) {
      console.warn("Firebase Admin SDK initialization warning:", err);
    }
  }
  return { adminDb: adminDbInstance, auth: authInstance };
}

// Global safety error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

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
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Firebase Admin is not available" });
      }
      const results: Record<string, any> = {};

      // 1. Initialize Plans collection
      const defaultPlans = [
        { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, price: 19 },
        { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, price: 39 },
        { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, price: 79 }
      ];

      for (const p of defaultPlans) {
        await adminDb.collection("plans").doc(p.id).set({
          name: p.name,
          usersLimit: p.usersLimit,
          secretariesLimit: p.secretariesLimit,
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
        "packages",
        "patient_packages",
        "stocks",
        "profiles",
        "reminder_settings",
        "staff",
        "referrals"
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
      const { adminDb, auth } = getFirebaseAdmin();

      // Enforce role restriction: non-admins can only assign 'secretary'
      let assignedRole = (role || 'secretary').toLowerCase();
      const isMasterAdmin = userId === 'admin_master' || userId === 'tFHvaQo649hwrlQfisr2x8qlv8v2';
      let isAdminUser = isMasterAdmin;
      if (!isAdminUser && adminDb) {
        try {
          const callerDoc = await adminDb.collection("users").doc(userId).get();
          if (callerDoc.exists && callerDoc.data()?.role === 'admin') {
            isAdminUser = true;
          }
        } catch {
          isAdminUser = false;
        }
      }
      if (!isAdminUser && assignedRole !== 'secretary') {
        assignedRole = 'secretary';
      }

      let authUser;
      let createdInAuth = false;
      let authErrorEncountered = false;
      let authErrorMessage = "";
      
      try {
        if (!auth) {
          throw new Error("Identity Toolkit API / Auth SDK not available");
        }
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
          console.log("[Auth] Identity Toolkit API not enabled in GCP project; managing staff in Firestore directly.");
          authErrorEncountered = true;
          authErrorMessage = "Identity Toolkit API not active";

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
            console.log("[Auth] REST Auth check for staff:", restError.response?.data?.error?.message || restError.message);
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
        role: assignedRole,
        warning: authErrorEncountered ? "Nota: Se guardó en Firestore pero Identity Toolkit API está inactiva en tu consola Google Cloud; por favor actívala." : undefined,
        message: createdInAuth ? "Creado exitosamente" : "Actualizado (si los permisos lo permiten)" 
      });
    } catch (error: any) {
      console.error("User Management Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Patients
  app.get("/api/patients", async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Database not available" });
      }
      console.log("Fetching patients from Firestore (Admin)...");
      const snapshot = await adminDb.collection("patients").orderBy("name", "asc").get();
      const patients = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
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
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Database not available" });
      }
      console.log("Fetching stocks from Firestore (Admin)...");
      const snapshot = await adminDb.collection("stocks").orderBy("name", "asc").get();
      const stocks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
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
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Database not available" });
      }
      const snapshot = await adminDb.collection("users").get();
      
      const professionals = snapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() as any }))
        .filter((user: any) => user.role !== "admin");
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
      const { adminDb, auth } = getFirebaseAdmin();
      let authUser;
      let createdInAuth = false;
      let authErrorEncountered = false;
      let authErrorMessage = "";
      
      try {
        if (!auth) {
          throw new Error("Identity Toolkit API / Auth SDK not available");
        }
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
          console.log("[Auth] Identity Toolkit API not enabled in GCP project; managing user in Firestore directly.");
          authErrorEncountered = true;
          authErrorMessage = "Identity Toolkit API not active";

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
            console.log("[Auth] REST Auth check for user:", restError.response?.data?.error?.message || restError.message);
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

  // Helpers for Firestore REST operations with API Key
  const getFirestoreRestUrl = (subpath: string) => {
    const dbId = firebaseConfig.firestoreDatabaseId || "turneroweb";
    return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/${subpath}?key=${firebaseConfig.apiKey}`;
  };

  function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined || val === null) continue;
      if (typeof val === 'string') {
        fields[key] = { stringValue: val };
      } else if (typeof val === 'number') {
        fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val };
      } else if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(item => {
              if (typeof item === 'object' && item !== null) {
                return { mapValue: { fields: toFirestoreFields(item) } };
              }
              if (typeof item === 'number') {
                return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
              }
              if (typeof item === 'boolean') return { booleanValue: item };
              return { stringValue: String(item) };
            })
          }
        };
      } else if (typeof val === 'object') {
        fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
      }
    }
    return fields;
  }

  function fromFirestoreFields(fields: Record<string, any> = {}): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(fields)) {
      if ('stringValue' in val) result[key] = val.stringValue;
      else if ('integerValue' in val) result[key] = Number(val.integerValue);
      else if ('doubleValue' in val) result[key] = Number(val.doubleValue);
      else if ('booleanValue' in val) result[key] = Boolean(val.booleanValue);
      else if ('timestampValue' in val) result[key] = val.timestampValue;
      else if ('arrayValue' in val) {
        result[key] = (val.arrayValue?.values || []).map((item: any) => {
          if ('mapValue' in item) return fromFirestoreFields(item.mapValue.fields);
          if ('stringValue' in item) return item.stringValue;
          if ('integerValue' in item) return Number(item.integerValue);
          if ('doubleValue' in item) return Number(item.doubleValue);
          if ('booleanValue' in item) return Boolean(item.booleanValue);
          return item;
        });
      } else if ('mapValue' in val) {
        result[key] = fromFirestoreFields(val.mapValue.fields);
      }
    }
    return result;
  }

  // Synchronization of Plans & Bonificaciones with Firebase Firestore
  app.post("/api/admin/sync-plans", async (req, res) => {
    try {
      // 1. Fetch plans via Firestore REST
      const defaultPlans = [
        { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, price: 30000 },
        { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, price: 40000 },
        { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, price: 50000 }
      ];

      const plansMap: Record<string, any> = {};
      try {
        const plansResponse = await fetch(getFirestoreRestUrl("plans"));
        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          if (plansData.documents) {
            plansData.documents.forEach((doc: any) => {
              const id = doc.name.split("/").pop();
              const d = fromFirestoreFields(doc.fields || {});
              plansMap[id] = {
                id,
                name: d.name || id,
                price: Number(d.price) || 0,
                usersLimit: Number(d.usersLimit) || 1,
                secretariesLimit: Number(d.secretariesLimit) || 1
              };
            });
          }
        }
      } catch (err) {
        console.warn("Could not query plans via REST:", err);
      }

      for (const p of defaultPlans) {
        if (!plansMap[p.id]) plansMap[p.id] = p;
      }

      // 2. Fetch referrals
      const referralsList: any[] = [];
      try {
        const refResponse = await fetch(getFirestoreRestUrl("referrals"));
        if (refResponse.ok) {
          const refData = await refResponse.json();
          if (refData.documents) {
            refData.documents.forEach((doc: any) => {
              const id = doc.name.split("/").pop();
              referralsList.push({ id, ...fromFirestoreFields(doc.fields || {}) });
            });
          }
        }
      } catch (err) {
        console.warn("Could not query referrals via REST:", err);
      }

      // 3. Fetch users
      const allUsersMap: Map<string, any> = new Map();
      try {
        const usersResponse = await fetch(getFirestoreRestUrl("users"));
        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          if (usersData.documents) {
            usersData.documents.forEach((doc: any) => {
              const id = doc.name.split("/").pop();
              allUsersMap.set(id, { id, ...fromFirestoreFields(doc.fields || {}) });
            });
          }
        }
      } catch (err) {
        console.warn("Could not query users via REST:", err);
      }

      // Also check staff collection
      try {
        const staffResponse = await fetch(getFirestoreRestUrl("staff"));
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          if (staffData.documents) {
            staffData.documents.forEach((doc: any) => {
              const sId = doc.name.split("/").pop();
              const sData = fromFirestoreFields(doc.fields || {});
              const targetUid = sData.authUid || sId;
              if (!allUsersMap.has(targetUid) && sData.email) {
                allUsersMap.set(targetUid, {
                  id: targetUid,
                  name: sData.name || sData.email,
                  email: sData.email,
                  role: sData.role || 'medico',
                  status: sData.status || 'Activo',
                  activePlanId: 'plus'
                });
              }
            });
          }
        }
      } catch (staffErr) {
        // Ignored
      }

      const syncSummary = {
        totalUsers: allUsersMap.size,
        syncedCount: 0,
        withDiscountsCount: 0,
        totalMonthlyBilling: 0,
        users: [] as any[]
      };

      for (const [userId, userData] of allUsersMap.entries()) {
        const planKey = (userData.activePlanId || userData.planId || 'plus').toLowerCase();
        const plan = plansMap[planKey] || plansMap['plus'] || Object.values(plansMap)[0];
        const basePrice = Math.max(0, Number(plan.price) || 0);
        const bonificaciones: any[] = [];

        // Welcome discount
        const isReferred = Boolean(
          userData.referralInfo?.isReferred ||
          (userData.referralDiscount?.active && userData.referralInfo?.discountValue !== undefined)
        );

        if (isReferred && userData.referralDiscount?.active !== false) {
          const discType = userData.referralInfo?.discountType || userData.referralDiscount?.type || 'percent';
          const discValue = Number(userData.referralInfo?.discountValue ?? userData.referralDiscount?.value ?? 0);
          if (discValue > 0) {
            const discAmount = discType === 'percent'
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);
            const referrerLabel = userData.referralInfo?.referrerName || userData.referralInfo?.referrerEmail || 'Colega';

            bonificaciones.push({
              id: `ref-welcome-${userId}`,
              title: 'Descuento de Bienvenida por Referido',
              source: 'referral_welcome',
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} (Referido por ${referrerLabel})`,
              beneficiaryType: 'referred'
            });
          }
        }

        // Referral reward discounts
        const userReferralsAsReferrer = referralsList.filter(
          (r: any) => (r.referrerId === userId || r.referrerEmail === userData.email) && r.status === 'active'
        );

        userReferralsAsReferrer.forEach((ref: any) => {
          const discType = ref.referrerDiscountType || 'percent';
          const discValue = Number(ref.referrerDiscountValue) || 0;
          if (discValue > 0) {
            const discAmount = discType === 'percent'
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);
            const colleagueLabel = ref.referredUserName || ref.referredUserEmail || 'Colega';

            bonificaciones.push({
              id: `ref-reward-${ref.id}`,
              title: 'Recompensa por Colega Referido',
              source: 'referral_reward',
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} por recomendar a ${colleagueLabel}`,
              beneficiaryType: 'referrer',
              referralId: ref.id
            });
          }
        });

        if (userReferralsAsReferrer.length === 0 && userData.referralReward?.hasReward && userData.referralReward?.discountValue) {
          const discType = userData.referralReward.discountType || 'percent';
          const discValue = Number(userData.referralReward.discountValue) || 0;
          if (discValue > 0) {
            const discAmount = discType === 'percent'
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);

            bonificaciones.push({
              id: `user-reward-direct-${userId}`,
              title: 'Recompensa por Recomendación',
              source: 'referral_reward',
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} por colega referido (${userData.referralReward.rewardFromUserName || 'Colega'})`,
              beneficiaryType: 'referrer'
            });
          }
        }

        // Custom administrative bonus
        if (userData.customBonus?.active && Number(userData.customBonus.discountValue) > 0) {
          const discType = userData.customBonus.discountType || 'percent';
          const discValue = Number(userData.customBonus.discountValue) || 0;
          if (discValue > 0) {
            const discAmount = discType === 'percent'
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);

            bonificaciones.push({
              id: `custom-bonus-${userId}`,
              title: userData.customBonus.title || 'Bonificación Especial Otorgada por el Administrador',
              source: 'custom_bonus',
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: userData.customBonus.reason || userData.customBonus.description || `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} otorgada por la administración del sistema`,
              beneficiaryType: 'manual'
            });
          }
        }

        // Include existing custom bonuses if present and not duplicated
        const existingBonuses = Array.isArray(userData.bonificaciones) 
          ? userData.bonificaciones 
          : (Array.isArray(userData.billingDetails?.bonificaciones) ? userData.billingDetails.bonificaciones : []);
        existingBonuses.forEach((b: any) => {
          if (b && b.id && !bonificaciones.some((x: any) => x.id === b.id) && (Number(b.discountAmount) > 0 || Number(b.discountValue) > 0)) {
            const discAmount = Number(b.discountAmount) || (b.discountType === 'percent' ? Math.round(((basePrice * Number(b.discountValue)) / 100) * 100) / 100 : Number(b.discountValue));
            bonificaciones.push({
              id: b.id,
              title: b.title || 'Bonificación Especial',
              source: b.source || 'custom_bonus',
              discountType: b.discountType || 'percent',
              discountValue: Number(b.discountValue) || 0,
              discountAmount: discAmount,
              description: b.description || 'Bonificación aplicada',
              beneficiaryType: b.beneficiaryType || 'manual'
            });
          }
        });

        const totalCalculatedDiscount = bonificaciones.reduce((sum, b) => sum + b.discountAmount, 0);
        const totalDiscount = Math.min(basePrice, Math.round(totalCalculatedDiscount * 100) / 100);
        const finalPrice = Math.max(0, Math.round((basePrice - totalDiscount) * 100) / 100);
        const hasDiscount = totalDiscount > 0;

        syncSummary.totalMonthlyBilling += finalPrice;
        if (hasDiscount) syncSummary.withDiscountsCount++;
        syncSummary.syncedCount++;

        syncSummary.users.push({
          id: userId,
          name: userData.name || userData.email || 'Sin nombre',
          email: userData.email || '',
          planName: plan.name,
          basePrice,
          discount: totalDiscount,
          finalPrice,
          bonificacionesCount: bonificaciones.length
        });

        const userUpdatePayload: any = {
          activePlanId: plan.id,
          planId: plan.id,
          planDetails: {
            id: plan.id,
            name: plan.name,
            basePrice: plan.price,
            usersLimit: plan.usersLimit,
            secretariesLimit: plan.secretariesLimit
          },
          billingDetails: {
            planId: plan.id,
            planName: plan.name,
            basePrice,
            usersLimit: plan.usersLimit,
            secretariesLimit: plan.secretariesLimit,
            totalDiscount,
            finalPrice,
            hasDiscount,
            bonificaciones,
            syncedAt: new Date().toISOString()
          },
          planPrice: finalPrice,
          basePlanPrice: basePrice,
          discountApplied: totalDiscount,
          updatedAt: new Date().toISOString()
        };

        if (hasDiscount) {
          userUpdatePayload.referralDiscount = {
            active: true,
            totalDiscount,
            finalPrice,
            bonificacionesCount: bonificaciones.length,
            summary: bonificaciones.map((b: any) => b.description).join(', ')
          };
        }

        // Persist directly to Firestore via REST
        try {
          const updateUrl = `${getFirestoreRestUrl(`users/${userId}`)}&updateMask.fieldPaths=activePlanId&updateMask.fieldPaths=planId&updateMask.fieldPaths=planDetails&updateMask.fieldPaths=billingDetails&updateMask.fieldPaths=planPrice&updateMask.fieldPaths=basePlanPrice&updateMask.fieldPaths=discountApplied&updateMask.fieldPaths=updatedAt${hasDiscount ? '&updateMask.fieldPaths=referralDiscount' : ''}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: toFirestoreFields(userUpdatePayload) })
          });
        } catch (uPatchErr) {
          console.warn(`Could not patch user ${userId} via REST:`, uPatchErr);
        }
      }

      // Record sync status in system_stats
      syncSummary.totalMonthlyBilling = Math.round(syncSummary.totalMonthlyBilling * 100) / 100;
      try {
        const statsPayload = {
          lastSyncedAt: new Date().toISOString(),
          totalMonthlyBilling: syncSummary.totalMonthlyBilling,
          totalUsers: syncSummary.totalUsers,
          syncedCount: syncSummary.syncedCount,
          withDiscountsCount: syncSummary.withDiscountsCount,
          breakdown: syncSummary.users,
          updatedAt: new Date().toISOString()
        };
        await fetch(getFirestoreRestUrl("system_stats/billing_summary"), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFirestoreFields(statsPayload) })
        });
      } catch (statsErr) {
        console.warn("Could not save billing summary via REST:", statsErr);
      }

      res.json({
        success: true,
        ...syncSummary
      });
    } catch (error: any) {
      console.error("Sync Plans Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sync single user
  app.post("/api/admin/sync-single-user", async (req, res) => {
    try {
      const { userId, targetPlanId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Fetch plans
      const defaultPlans = [
        { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, price: 30000 },
        { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, price: 40000 },
        { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, price: 50000 }
      ];
      const plansMap: Record<string, any> = {};
      try {
        const plansResponse = await fetch(getFirestoreRestUrl("plans"));
        if (plansResponse.ok) {
          const pData = await plansResponse.json();
          if (pData.documents) {
            pData.documents.forEach((doc: any) => {
              const id = doc.name.split("/").pop();
              const d = fromFirestoreFields(doc.fields || {});
              plansMap[id] = { id, name: d.name || id, price: Number(d.price) || 0, usersLimit: Number(d.usersLimit) || 1, secretariesLimit: Number(d.secretariesLimit) || 1 };
            });
          }
        }
      } catch (e) {
        // Ignored
      }
      for (const p of defaultPlans) {
        if (!plansMap[p.id]) plansMap[p.id] = p;
      }

      // Fetch referrals
      const referralsList: any[] = [];
      try {
        const refResponse = await fetch(getFirestoreRestUrl("referrals"));
        if (refResponse.ok) {
          const rData = await refResponse.json();
          if (rData.documents) {
            rData.documents.forEach((doc: any) => {
              const id = doc.name.split("/").pop();
              referralsList.push({ id, ...fromFirestoreFields(doc.fields || {}) });
            });
          }
        }
      } catch (e) {
        // Ignored
      }

      // Fetch user doc
      let userData: any = { id: userId, activePlanId: targetPlanId || 'plus' };
      try {
        const userResp = await fetch(getFirestoreRestUrl(`users/${userId}`));
        if (userResp.ok) {
          const uDoc = await userResp.json();
          if (uDoc.fields) {
            userData = { id: userId, ...fromFirestoreFields(uDoc.fields) };
          }
        }
      } catch (e) {
        // Ignored
      }

      const planKey = (targetPlanId || userData.activePlanId || userData.planId || 'plus').toLowerCase();
      const plan = plansMap[planKey] || plansMap['plus'] || Object.values(plansMap)[0];
      const basePrice = Math.max(0, Number(plan.price) || 0);
      const bonificaciones: any[] = [];

      const isReferred = Boolean(
        userData.referralInfo?.isReferred ||
        (userData.referralDiscount?.active && userData.referralInfo?.discountValue !== undefined)
      );

      if (isReferred && userData.referralDiscount?.active !== false) {
        const discType = userData.referralInfo?.discountType || userData.referralDiscount?.type || 'percent';
        const discValue = Number(userData.referralInfo?.discountValue ?? userData.referralDiscount?.value ?? 0);
        if (discValue > 0) {
          const discAmount = discType === 'percent'
            ? Math.round(((basePrice * discValue) / 100) * 100) / 100
            : Math.min(basePrice, discValue);
          const referrerLabel = userData.referralInfo?.referrerName || userData.referralInfo?.referrerEmail || 'Colega';

          bonificaciones.push({
            id: `ref-welcome-${userId}`,
            title: 'Descuento de Bienvenida por Referido',
            source: 'referral_welcome',
            discountType: discType,
            discountValue: discValue,
            discountAmount: discAmount,
            description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} (Referido por ${referrerLabel})`,
            beneficiaryType: 'referred'
          });
        }
      }

      const userReferralsAsReferrer = referralsList.filter(
        (r: any) => (r.referrerId === userId || r.referrerEmail === userData.email) && r.status === 'active'
      );

      userReferralsAsReferrer.forEach((ref: any) => {
        const discType = ref.referrerDiscountType || 'percent';
        const discValue = Number(ref.referrerDiscountValue) || 0;
        if (discValue > 0) {
          const discAmount = discType === 'percent'
            ? Math.round(((basePrice * discValue) / 100) * 100) / 100
            : Math.min(basePrice, discValue);
          const colleagueLabel = ref.referredUserName || ref.referredUserEmail || 'Colega';

          bonificaciones.push({
            id: `ref-reward-${ref.id}`,
            title: 'Recompensa por Colega Referido',
            source: 'referral_reward',
            discountType: discType,
            discountValue: discValue,
            discountAmount: discAmount,
            description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} por recomendar a ${colleagueLabel}`,
            beneficiaryType: 'referrer',
            referralId: ref.id
          });
        }
      });

      const totalCalculatedDiscount = bonificaciones.reduce((sum, b) => sum + b.discountAmount, 0);
      const totalDiscount = Math.min(basePrice, Math.round(totalCalculatedDiscount * 100) / 100);
      const finalPrice = Math.max(0, Math.round((basePrice - totalDiscount) * 100) / 100);
      const hasDiscount = totalDiscount > 0;

      const userUpdatePayload: any = {
        activePlanId: plan.id,
        planId: plan.id,
        planDetails: {
          id: plan.id,
          name: plan.name,
          basePrice: plan.price,
          usersLimit: plan.usersLimit,
          secretariesLimit: plan.secretariesLimit
        },
        billingDetails: {
          planId: plan.id,
          planName: plan.name,
          basePrice,
          usersLimit: plan.usersLimit,
          secretariesLimit: plan.secretariesLimit,
          totalDiscount,
          finalPrice,
          hasDiscount,
          bonificaciones,
          syncedAt: new Date().toISOString()
        },
        planPrice: finalPrice,
        basePlanPrice: basePrice,
        discountApplied: totalDiscount,
        updatedAt: new Date().toISOString()
      };

      if (hasDiscount) {
        userUpdatePayload.referralDiscount = {
          active: true,
          totalDiscount,
          finalPrice,
          bonificacionesCount: bonificaciones.length,
          summary: bonificaciones.map((b: any) => b.description).join(', ')
        };
      }

      const updateUrl = `${getFirestoreRestUrl(`users/${userId}`)}&updateMask.fieldPaths=activePlanId&updateMask.fieldPaths=planId&updateMask.fieldPaths=planDetails&updateMask.fieldPaths=billingDetails&updateMask.fieldPaths=planPrice&updateMask.fieldPaths=basePlanPrice&updateMask.fieldPaths=discountApplied&updateMask.fieldPaths=updatedAt${hasDiscount ? '&updateMask.fieldPaths=referralDiscount' : ''}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestoreFields(userUpdatePayload) })
      });

      res.json({
        success: true,
        billing: userUpdatePayload.billingDetails
      });
    } catch (error: any) {
      console.error("Sync Single User Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Detect production environment reliably (when running bundled dist/server.cjs, NODE_ENV=production, or dist/index.html exists)
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.argv[1]?.includes("server.cjs") ||
    (typeof __filename !== "undefined" && __filename.endsWith("server.cjs")) ||
    (!fs.existsSync(path.join(process.cwd(), "src", "main.tsx")) && fs.existsSync(path.join(process.cwd(), "dist", "index.html")));

  if (isProduction) {
    process.env.NODE_ENV = "production";
  }

  // Vite middleware for development vs static files for production
  if (!isProduction) {
    const { createServer } = await import("vite");
    const vite = await createServer({
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err) => {
    console.error("Server error:", err);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, closing server gracefully...");
    server.close(() => {
      process.exit(0);
    });
  });
}

startServer();
