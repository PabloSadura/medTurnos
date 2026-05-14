import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy } from "firebase/firestore";
import fs from "fs";

// Load Firebase config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get Patients
  app.get("/api/patients", async (req, res) => {
    try {
      console.log("Fetching patients from Firestore...");
      const q = query(collection(db, "patients"), orderBy("name", "asc"));
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
      const q = query(collection(db, "stocks"), orderBy("name", "asc"));
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
