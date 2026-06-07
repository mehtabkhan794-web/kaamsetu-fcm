const express = require("express");
const admin = require("firebase-admin");

const app = express();

app.use(express.json());

try {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin Initialized");
} catch (error) {
  console.error("❌ Firebase Init Error:", error);
}

app.get("/", async (req, res) => {
  try {
    const db = admin.firestore();

    const test = await db.collection("job_notifications")
      .limit(1)
      .get();

    res.send(
      `KaamSetu FCM Server Running | Firebase Connected | Docs: ${test.size}`
    );
  } catch (error) {
    res.status(500).send(error.message);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});