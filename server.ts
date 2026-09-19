import express from "express";
import path from "path";
import admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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
          console.warn(`[Firebase Admin] getAdminFirestore(${dbId}) fallback to default:`, dbErr);
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

// Password validation according to clinical policy
function validateServerPassword(password: string): string | null {
  if (!password || password.trim().length < 12) {
    return "La contraseña debe tener al menos 12 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra minúscula.";
  }
  if (!/[0-9]/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return "La contraseña debe incluir al menos un carácter especial (!@#$%^&*...).";
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Defensive HTTP Headers via Helmet
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://apis.google.com",
            "https://accounts.google.com",
            "https://*.googleapis.com"
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com"
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "data:"
          ],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://*.googleusercontent.com",
            "https://*.gstatic.com",
            "https://*.googleapis.com"
          ],
          connectSrc: [
            "'self'",
            "https://*.googleapis.com",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://firestore.googleapis.com",
            "https://*.firebaseio.com",
            "wss://*.firebaseio.com",
            "https://accounts.google.com",
            "https://apis.google.com",
            "https://*.run.app"
          ],
          frameSrc: [
            "'self'",
            "https://accounts.google.com",
            "https://*.firebaseapp.com"
          ],
          frameAncestors: [
            "'self'",
            "https://*.google.com",
            "https://*.run.app",
            "https://ai.studio"
          ]
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xContentTypeOptions: true
    })
  );

  // Parse JSON payloads with strict size limit
  app.use(express.json({ limit: "500kb" }));

  // Cache-Control headers for all API responses to prevent storing clinical/session data
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // Rate Limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas peticiones. Por favor intente nuevamente en unos minutos." }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Límite de solicitudes de autenticación alcanzado. Espere 15 minutos." }
  });

  app.use("/api/", generalLimiter);
  app.use("/api/staff/manage", authLimiter);
  app.use("/api/admin/", authLimiter);

  // ------------------------------------------------------------
  // Authentication & Authorization Middleware
  // ------------------------------------------------------------
  async function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Acceso no autorizado: Token de sesión ausente." });
    }
    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      return res.status(401).json({ error: "Acceso no autorizado: Token inválido." });
    }

    try {
      const { auth } = getFirebaseAdmin();
      if (!auth) {
        return res.status(503).json({ error: "Servicio de autenticación no inicializado en el servidor." });
      }
      const decoded = await auth.verifyIdToken(idToken);
      (req as any).user = decoded;
      next();
    } catch (err: any) {
      return res.status(401).json({ error: "Sesión expirada o token no válido. Inicie sesión nuevamente." });
    }
  }

  async function requireAdminRole(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = (req as any).user;
    if (!user || !user.uid) {
      return res.status(401).json({ error: "Usuario no autenticado." });
    }

    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible." });
      }
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "admin") {
        return res.status(403).json({ error: "Acceso denegado: Se requieren privilegios de Administrador del Sistema." });
      }
      (req as any).userProfile = userDoc.data();
      next();
    } catch (err: any) {
      return res.status(500).json({ error: "Error al verificar autorización de administrador." });
    }
  }

  // ------------------------------------------------------------
  // Public Health Endpoint
  // ------------------------------------------------------------
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ------------------------------------------------------------
  // Protected Database Initialization (Admin Only)
  // ------------------------------------------------------------
  app.post("/api/database/init", authenticateToken, requireAdminRole, async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Firebase Admin is not available" });
      }
      const results: Record<string, any> = {};

      // 1. Initialize Plans collection
      const defaultPlans = [
        { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, price: 30000 },
        { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, price: 40000 },
        { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, price: 50000 }
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

      // 2. Ensure initial collection documents
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
        message: "Base de datos inicializada de forma segura",
        results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // User & Staff Management API (Authenticated & Role-Enforced)
  // ------------------------------------------------------------
  app.post("/api/staff/manage", authenticateToken, async (req, res) => {
    const callerUid = (req as any).user.uid;
    const { email, password, name, role, permissions, status, userId, staffId } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Faltan campos obligatorios (nombre y email)" });
    }

    try {
      const { adminDb, auth } = getFirebaseAdmin();

      // Check caller role in Firestore
      let isCallerAdmin = false;
      if (adminDb) {
        try {
          const callerDoc = await adminDb.collection("users").doc(callerUid).get();
          isCallerAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
        } catch {
          isCallerAdmin = false;
        }
      }

      // Non-admins can ONLY manage staff under their own practitioner account and role must be 'secretary'
      if (!isCallerAdmin) {
        if (userId && userId !== callerUid) {
          return res.status(403).json({ error: "No tiene permisos para gestionar personal de otro profesional." });
        }
      }

      const assignedRole = isCallerAdmin ? (role || "secretary").toLowerCase() : "secretary";
      const targetUserId = isCallerAdmin ? (userId || callerUid) : callerUid;

      // Validate password policy if password is provided
      if (password && password.trim().length > 0) {
        const pwdError = validateServerPassword(password);
        if (pwdError) {
          return res.status(400).json({ error: pwdError });
        }
      }

      let authUser;
      let createdInAuth = false;
      let authErrorEncountered = false;

      try {
        if (!auth) {
          throw new Error("Servicio de autenticación no disponible.");
        }
        authUser = await auth.getUserByEmail(email);

        if (password && password.trim().length > 0) {
          await auth.updateUser(authUser.uid, { password });
        }
        await auth.updateUser(authUser.uid, { displayName: name });
      } catch (error: any) {
        const isIdentityToolkitError =
          error.message?.includes("identitytoolkit.googleapis.com") ||
          error.message?.includes("Identity Toolkit API") ||
          error.code === "auth/insufficient-permission" ||
          error.message?.includes("PERMISSION_DENIED");

        if (isIdentityToolkitError) {
          authErrorEncountered = true;
          let fallbackUid = staffId;
          if (!fallbackUid) {
            const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
            if (!existingSnap.empty) {
              fallbackUid = existingSnap.docs[0].id;
            } else {
              fallbackUid = adminDb.collection("users").doc().id;
            }
          }
          authUser = { uid: fallbackUid, email };
        } else if (error.code === "auth/user-not-found") {
          if (!password || password.trim().length === 0) {
            return res.status(400).json({ error: "La contraseña es obligatoria para nuevos usuarios." });
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
            const isRestIdentityToolkitError =
              restError.response?.data?.error?.message?.includes("Identity Toolkit API") ||
              restError.message?.includes("Identity Toolkit API");
            if (isRestIdentityToolkitError) {
              authErrorEncountered = true;
              let fallbackUid = staffId || adminDb.collection("users").doc().id;
              authUser = { uid: fallbackUid, email };
            } else {
              return res.status(400).json({ error: `Error de autenticación: ${restError.response?.data?.error?.message || restError.message}` });
            }
          }
        } else {
          return res.status(500).json({ error: "Error al procesar la cuenta de usuario." });
        }
      }

      res.json({
        success: true,
        uid: authUser?.uid,
        role: assignedRole,
        targetUserId,
        warning: authErrorEncountered ? "Nota: Identity Toolkit API no está activa en su consola Google Cloud." : undefined,
        message: createdInAuth ? "Usuario creado exitosamente" : "Usuario actualizado exitosamente"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // Audit Logs & Security Administration APIs
  // ------------------------------------------------------------
  app.post("/api/audit/log", authenticateToken, async (req, res) => {
    try {
      const { action, section, details, changes, targetId } = req.body;
      const caller = (req as any).user;
      const callerUid = caller.uid;

      if (!action || !section) {
        return res.status(400).json({ error: "Acción y sección son obligatorias para el registro de auditoría." });
      }

      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible para auditoría." });
      }

      // Fetch user role info
      let userRole = "medico";
      let userName = caller.name || caller.email || "Usuario";
      try {
        const userDoc = await adminDb.collection("users").doc(callerUid).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          userRole = uData?.role || "medico";
          userName = uData?.name || uData?.displayName || userName;
        }
      } catch {
        // Fallback to token
      }

      const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
      const userAgent = req.headers["user-agent"] || "Desconocido";

      const auditEntry = {
        authorId: callerUid,
        authorEmail: caller.email || "anon@medturnos.com",
        authorName: userName,
        authorRole: userRole,
        action,
        section,
        details: details || `Modificación en ${section}`,
        changes: changes || {},
        targetId: targetId || callerUid,
        clientIp: clientIp.split(",")[0].trim(),
        userAgent,
        createdAt: new Date().toISOString(),
        serverTimestamp: new Date().toISOString()
      };

      const docRef = await adminDb.collection("audit_logs").add(auditEntry);

      res.json({
        success: true,
        id: docRef.id,
        timestamp: auditEntry.createdAt
      });
    } catch (error: any) {
      console.error("[Audit API Error]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/audit/logs", authenticateToken, requireAdminRole, async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }

      const limitCount = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
      const snapshot = await adminDb.collection("audit_logs")
        .orderBy("createdAt", "desc")
        .limit(limitCount)
        .get();

      const logs = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json(logs);
    } catch (error: any) {
      console.error("[Audit Logs Fetch Error]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/revoke-sessions", authenticateToken, async (req, res) => {
    try {
      const callerUid = (req as any).user.uid;
      const { auth } = getFirebaseAdmin();
      if (auth && typeof auth.revokeRefreshTokens === "function") {
        await auth.revokeRefreshTokens(callerUid);
      }
      res.json({
        success: true,
        message: "Otras sesiones cerradas exitosamente. Se revocaron los tokens de actualización activos."
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // Appointment Status Transition Endpoint with Strict Validation
  // ------------------------------------------------------------
  app.post("/api/appointments/:id/status", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const caller = (req as any).user;
      const callerUid = caller.uid;

      if (!status) {
        return res.status(400).json({ error: "Debe especificar el nuevo estado del turno." });
      }

      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }

      const aptRef = adminDb.collection("appointments").doc(id);
      const aptSnap = await aptRef.get();

      if (!aptSnap.exists) {
        return res.status(404).json({ error: "El turno no existe." });
      }

      const aptData = aptSnap.data() || {};

      // Check caller authorization
      const callerDoc = await adminDb.collection("users").doc(callerUid).get();
      const isCallerAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
      const isOwner = aptData.userId === callerUid;

      // Check if staff
      let isStaff = false;
      if (!isCallerAdmin && !isOwner) {
        const staffSnap = await adminDb.collection("staff")
          .where("authUid", "==", callerUid)
          .where("userId", "==", aptData.userId)
          .get();
        isStaff = !staffSnap.empty;
      }

      if (!isCallerAdmin && !isOwner && !isStaff) {
        return res.status(403).json({ error: "No tiene permisos para modificar este turno." });
      }

      // STRICT VALIDATION: If appointment is already finished, it cannot revert to an earlier status
      const currentStatus = (aptData.status || "").toLowerCase().trim();
      const targetStatus = status.toLowerCase().trim();
      const isAlreadyFinished = currentStatus === "finished" || currentStatus === "finalizado";
      const isTargetFinished = targetStatus === "finished" || targetStatus === "finalizado";

      if (isAlreadyFinished && !isTargetFinished) {
        return res.status(403).json({
          error: "Operación rechazada: El turno ya se encuentra finalizado y no se permite volver a un estado anterior."
        });
      }

      await aptRef.update({
        status: targetStatus,
        updatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        id,
        previousStatus: currentStatus,
        newStatus: targetStatus
      });
    } catch (error: any) {
      console.error("[Appointment Status API Error]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // Clinical / Data APIs (Scoped to Authenticated User)
  // ------------------------------------------------------------
  app.get("/api/patients", authenticateToken, async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }
      const callerUid = (req as any).user.uid;
      const callerDoc = await adminDb.collection("users").doc(callerUid).get();
      const isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";

      let query = adminDb.collection("patients");
      if (!isAdmin) {
        // Scoped to practitioner
        query = query.where("userId", "==", callerUid);
      }
      const snapshot = await query.orderBy("name", "asc").get();
      const patients = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json(patients);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stocks", authenticateToken, async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }
      const callerUid = (req as any).user.uid;
      const callerDoc = await adminDb.collection("users").doc(callerUid).get();
      const isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";

      let query = adminDb.collection("stocks");
      if (!isAdmin) {
        query = query.where("userId", "==", callerUid);
      }
      const snapshot = await query.orderBy("name", "asc").get();
      const stocks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json(stocks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // System Admin Endpoints (Strictly Admin-Only)
  // ------------------------------------------------------------
  app.get("/api/admin/professionals", authenticateToken, requireAdminRole, async (req, res) => {
    try {
      const { adminDb } = getFirebaseAdmin();
      if (!adminDb) {
        return res.status(503).json({ error: "Base de datos no disponible" });
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

  app.post("/api/admin/professionals/manage", authenticateToken, requireAdminRole, async (req, res) => {
    const { id, name, email, password, role, status } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Nombre y email son requeridos." });
    }

    if (password && password.trim().length > 0) {
      const pwdError = validateServerPassword(password);
      if (pwdError) {
        return res.status(400).json({ error: pwdError });
      }
    }

    try {
      const { adminDb, auth } = getFirebaseAdmin();
      let authUser;
      let createdInAuth = false;
      let authErrorEncountered = false;

      try {
        if (!auth) throw new Error("Auth service unavailable");
        authUser = await auth.getUserByEmail(email);

        if (password && password.trim().length > 0) {
          await auth.updateUser(authUser.uid, { password });
        }
        await auth.updateUser(authUser.uid, { displayName: name });
      } catch (error: any) {
        const isIdentityToolkitError =
          error.message?.includes("identitytoolkit.googleapis.com") ||
          error.message?.includes("Identity Toolkit API") ||
          error.code === "auth/insufficient-permission" ||
          error.message?.includes("PERMISSION_DENIED");

        if (isIdentityToolkitError) {
          authErrorEncountered = true;
          let fallbackUid = id;
          if (!fallbackUid) {
            const existingSnap = await adminDb.collection("users").where("email", "==", email).get();
            fallbackUid = !existingSnap.empty ? existingSnap.docs[0].id : adminDb.collection("users").doc().id;
          }
          authUser = { uid: fallbackUid, email };
        } else if (error.code === "auth/user-not-found") {
          if (!password || password.trim().length === 0) {
            return res.status(400).json({ error: "La contraseña es obligatoria para nuevos profesionales." });
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
            const isRestIdentityToolkitError =
              restError.response?.data?.error?.message?.includes("Identity Toolkit API") ||
              restError.message?.includes("Identity Toolkit API");
            if (isRestIdentityToolkitError) {
              authErrorEncountered = true;
              let fallbackUid = id || adminDb.collection("users").doc().id;
              authUser = { uid: fallbackUid, email };
            } else {
              return res.status(400).json({ error: `Error de autenticación: ${restError.response?.data?.error?.message || restError.message}` });
            }
          }
        } else {
          return res.status(500).json({ error: "Error al gestionar cuenta de profesional." });
        }
      }

      const authUid = authUser?.uid;
      const userData = {
        name,
        email,
        role: role || "medico",
        status: status || "Activo",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      try {
        await adminDb.collection("users").doc(authUid).set(userData, { merge: true });
      } catch (fsErr) {
        console.warn("Server-side Firestore write bypassed:", fsErr);
      }

      res.json({
        success: true,
        uid: authUid,
        warning: authErrorEncountered ? "Nota: Identity Toolkit API no está activa en Google Cloud." : undefined,
        message: createdInAuth ? "Profesional creado exitosamente" : "Profesional actualizado exitosamente"
      });
    } catch (error: any) {
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
      if (typeof val === "string") {
        fields[key] = { stringValue: val };
      } else if (typeof val === "number") {
        fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
      } else if (typeof val === "boolean") {
        fields[key] = { booleanValue: val };
      } else if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(item => {
              if (typeof item === "object" && item !== null) {
                return { mapValue: { fields: toFirestoreFields(item) } };
              }
              if (typeof item === "number") {
                return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
              }
              if (typeof item === "boolean") return { booleanValue: item };
              return { stringValue: String(item) };
            })
          }
        };
      } else if (typeof val === "object") {
        fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
      }
    }
    return fields;
  }

  function fromFirestoreFields(fields: Record<string, any> = {}): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(fields)) {
      if ("stringValue" in val) result[key] = val.stringValue;
      else if ("integerValue" in val) result[key] = Number(val.integerValue);
      else if ("doubleValue" in val) result[key] = Number(val.doubleValue);
      else if ("booleanValue" in val) result[key] = Boolean(val.booleanValue);
      else if ("timestampValue" in val) result[key] = val.timestampValue;
      else if ("arrayValue" in val) {
        result[key] = (val.arrayValue?.values || []).map((item: any) => {
          if ("mapValue" in item) return fromFirestoreFields(item.mapValue.fields);
          if ("stringValue" in item) return item.stringValue;
          if ("integerValue" in item) return Number(item.integerValue);
          if ("doubleValue" in item) return Number(item.doubleValue);
          if ("booleanValue" in item) return Boolean(item.booleanValue);
          return item;
        });
      } else if ("mapValue" in val) {
        result[key] = fromFirestoreFields(val.mapValue.fields);
      }
    }
    return result;
  }

  // ------------------------------------------------------------
  // Plan & Referral Discount Synchronization (Admin-Only)
  // ------------------------------------------------------------
  app.post("/api/admin/sync-plans", authenticateToken, requireAdminRole, async (req, res) => {
    try {
      const defaultPlans = [
        { id: "basico", name: "Básicos", usersLimit: 1, secretariesLimit: 1, price: 30000 },
        { id: "plus", name: "Plus", usersLimit: 3, secretariesLimit: 2, price: 40000 },
        { id: "premium", name: "Premium", usersLimit: 10, secretariesLimit: 5, price: 50000 }
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

      // Fetch referrals
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

      // Fetch users
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

      const syncSummary = {
        totalUsers: allUsersMap.size,
        syncedCount: 0,
        withDiscountsCount: 0,
        totalMonthlyBilling: 0,
        users: [] as any[]
      };

      for (const [userId, userData] of allUsersMap.entries()) {
        const planKey = (userData.activePlanId || userData.planId || "plus").toLowerCase();
        const plan = plansMap[planKey] || plansMap["plus"] || Object.values(plansMap)[0];
        const basePrice = Math.max(0, Number(plan.price) || 0);
        const bonificaciones: any[] = [];

        // Welcome discount
        const isReferred = Boolean(
          userData.referralInfo?.isReferred ||
          (userData.referralDiscount?.active && userData.referralInfo?.discountValue !== undefined)
        );

        if (isReferred && userData.referralDiscount?.active !== false) {
          const discType = userData.referralInfo?.discountType || userData.referralDiscount?.type || "percent";
          const discValue = Number(userData.referralInfo?.discountValue ?? userData.referralDiscount?.value ?? 0);
          if (discValue > 0) {
            const discAmount = discType === "percent"
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);
            const referrerLabel = userData.referralInfo?.referrerName || userData.referralInfo?.referrerEmail || "Colega";

            bonificaciones.push({
              id: `ref-welcome-${userId}`,
              title: "Descuento de Bienvenida por Referido",
              source: "referral_welcome",
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: `Bonificación del ${discValue}${discType === "percent" ? "%" : "$"} (Referido por ${referrerLabel})`,
              beneficiaryType: "referred"
            });
          }
        }

        // Referral reward discounts
        const userReferralsAsReferrer = referralsList.filter(
          (r: any) => (r.referrerId === userId || r.referrerEmail === userData.email) && r.status === "active"
        );

        userReferralsAsReferrer.forEach((ref: any) => {
          const discType = ref.referrerDiscountType || "percent";
          const discValue = Number(ref.referrerDiscountValue) || 0;
          if (discValue > 0) {
            const discAmount = discType === "percent"
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);
            const colleagueLabel = ref.referredUserName || ref.referredUserEmail || "Colega";

            bonificaciones.push({
              id: `ref-reward-${ref.id}`,
              title: "Recompensa por Colega Referido",
              source: "referral_reward",
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: `Bonificación del ${discValue}${discType === "percent" ? "%" : "$"} por recomendar a ${colleagueLabel}`,
              beneficiaryType: "referrer",
              referralId: ref.id
            });
          }
        });

        // Administrative custom bonuses
        if (userData.customBonus?.active && Number(userData.customBonus.discountValue) > 0) {
          const discType = userData.customBonus.discountType || "percent";
          const discValue = Number(userData.customBonus.discountValue) || 0;
          if (discValue > 0) {
            const discAmount = discType === "percent"
              ? Math.round(((basePrice * discValue) / 100) * 100) / 100
              : Math.min(basePrice, discValue);

            bonificaciones.push({
              id: `custom-bonus-${userId}`,
              title: userData.customBonus.title || "Bonificación Especial Otorgada por el Administrador",
              source: "custom_bonus",
              discountType: discType,
              discountValue: discValue,
              discountAmount: discAmount,
              description: userData.customBonus.reason || userData.customBonus.description || `Bonificación del ${discValue}${discType === "percent" ? "%" : "$"} otorgada por la administración`,
              beneficiaryType: "manual"
            });
          }
        }

        const existingBonuses = Array.isArray(userData.bonificaciones)
          ? userData.bonificaciones
          : (Array.isArray(userData.billingDetails?.bonificaciones) ? userData.billingDetails.bonificaciones : []);
        existingBonuses.forEach((b: any) => {
          if (b && b.id && !bonificaciones.some((x: any) => x.id === b.id) && (Number(b.discountAmount) > 0 || Number(b.discountValue) > 0)) {
            const discAmount = Number(b.discountAmount) || (b.discountType === "percent" ? Math.round(((basePrice * Number(b.discountValue)) / 100) * 100) / 100 : Number(b.discountValue));
            bonificaciones.push({
              id: b.id,
              title: b.title || "Bonificación Especial",
              source: b.source || "custom_bonus",
              discountType: b.discountType || "percent",
              discountValue: Number(b.discountValue) || 0,
              discountAmount: discAmount,
              description: b.description || "Bonificación aplicada",
              beneficiaryType: b.beneficiaryType || "manual"
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
          name: userData.name || userData.email || "Sin nombre",
          email: userData.email || "",
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
            summary: bonificaciones.map((b: any) => b.description).join(", ")
          };
        }

        try {
          const updateUrl = `${getFirestoreRestUrl(`users/${userId}`)}&updateMask.fieldPaths=activePlanId&updateMask.fieldPaths=planId&updateMask.fieldPaths=planDetails&updateMask.fieldPaths=billingDetails&updateMask.fieldPaths=planPrice&updateMask.fieldPaths=basePlanPrice&updateMask.fieldPaths=discountApplied&updateMask.fieldPaths=updatedAt${hasDiscount ? "&updateMask.fieldPaths=referralDiscount" : ""}`;
          await fetch(updateUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: toFirestoreFields(userUpdatePayload) })
          });
        } catch (uPatchErr) {
          console.warn(`Could not patch user ${userId} via REST:`, uPatchErr);
        }
      }

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
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/sync-single-user", authenticateToken, requireAdminRole, async (req, res) => {
    try {
      const { userId, targetPlanId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      const defaultPlans = [
        { id: "basico", name: "Básicos", usersLimit: 1, secretariesLimit: 1, price: 30000 },
        { id: "plus", name: "Plus", usersLimit: 3, secretariesLimit: 2, price: 40000 },
        { id: "premium", name: "Premium", usersLimit: 10, secretariesLimit: 5, price: 50000 }
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
      } catch {
        // Ignored
      }
      for (const p of defaultPlans) {
        if (!plansMap[p.id]) plansMap[p.id] = p;
      }

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
      } catch {
        // Ignored
      }

      let userData: any = { id: userId, activePlanId: targetPlanId || "plus" };
      try {
        const userResp = await fetch(getFirestoreRestUrl(`users/${userId}`));
        if (userResp.ok) {
          const uDoc = await userResp.json();
          if (uDoc.fields) {
            userData = { id: userId, ...fromFirestoreFields(uDoc.fields) };
          }
        }
      } catch {
        // Ignored
      }

      const planKey = (targetPlanId || userData.activePlanId || userData.planId || "plus").toLowerCase();
      const plan = plansMap[planKey] || plansMap["plus"] || Object.values(plansMap)[0];
      const basePrice = Math.max(0, Number(plan.price) || 0);
      const bonificaciones: any[] = [];

      const isReferred = Boolean(
        userData.referralInfo?.isReferred ||
        (userData.referralDiscount?.active && userData.referralInfo?.discountValue !== undefined)
      );

      if (isReferred && userData.referralDiscount?.active !== false) {
        const discType = userData.referralInfo?.discountType || userData.referralDiscount?.type || "percent";
        const discValue = Number(userData.referralInfo?.discountValue ?? userData.referralDiscount?.value ?? 0);
        if (discValue > 0) {
          const discAmount = discType === "percent"
            ? Math.round(((basePrice * discValue) / 100) * 100) / 100
            : Math.min(basePrice, discValue);
          const referrerLabel = userData.referralInfo?.referrerName || userData.referralInfo?.referrerEmail || "Colega";

          bonificaciones.push({
            id: `ref-welcome-${userId}`,
            title: "Descuento de Bienvenida por Referido",
            source: "referral_welcome",
            discountType: discType,
            discountValue: discValue,
            discountAmount: discAmount,
            description: `Bonificación del ${discValue}${discType === "percent" ? "%" : "$"} (Referido por ${referrerLabel})`,
            beneficiaryType: "referred"
          });
        }
      }

      const userReferralsAsReferrer = referralsList.filter(
        (r: any) => (r.referrerId === userId || r.referrerEmail === userData.email) && r.status === "active"
      );

      userReferralsAsReferrer.forEach((ref: any) => {
        const discType = ref.referrerDiscountType || "percent";
        const discValue = Number(ref.referrerDiscountValue) || 0;
        if (discValue > 0) {
          const discAmount = discType === "percent"
            ? Math.round(((basePrice * discValue) / 100) * 100) / 100
            : Math.min(basePrice, discValue);
          const colleagueLabel = ref.referredUserName || ref.referredUserEmail || "Colega";

          bonificaciones.push({
            id: `ref-reward-${ref.id}`,
            title: "Recompensa por Colega Referido",
            source: "referral_reward",
            discountType: discType,
            discountValue: discValue,
            discountAmount: discAmount,
            description: `Bonificación del ${discValue}${discType === "percent" ? "%" : "$"} por recomendar a ${colleagueLabel}`,
            beneficiaryType: "referrer",
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
          summary: bonificaciones.map((b: any) => b.description).join(", ")
        };
      }

      const updateUrl = `${getFirestoreRestUrl(`users/${userId}`)}&updateMask.fieldPaths=activePlanId&updateMask.fieldPaths=planId&updateMask.fieldPaths=planDetails&updateMask.fieldPaths=billingDetails&updateMask.fieldPaths=planPrice&updateMask.fieldPaths=basePlanPrice&updateMask.fieldPaths=discountApplied&updateMask.fieldPaths=updatedAt${hasDiscount ? "&updateMask.fieldPaths=referralDiscount" : ""}`;
      await fetch(updateUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFirestoreFields(userUpdatePayload) })
      });

      res.json({
        success: true,
        billing: userUpdatePayload.billingDetails
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------------
  // Environment & Vite / Static Middleware
  // ------------------------------------------------------------
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.argv[1]?.includes("server.cjs") ||
    (typeof __filename !== "undefined" && __filename.endsWith("server.cjs")) ||
    (!fs.existsSync(path.join(process.cwd(), "src", "main.tsx")) && fs.existsSync(path.join(process.cwd(), "dist", "index.html")));

  if (isProduction) {
    process.env.NODE_ENV = "production";
  }

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
    console.log(`[Server] MedTurnos secure server running on http://localhost:${PORT}`);
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
