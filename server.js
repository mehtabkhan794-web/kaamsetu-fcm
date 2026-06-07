const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin Initialized");
} catch (error) {
    console.error("X Firebase Init Error:", error);
}

app.get("/", async (req, res) => {
    try {
        const db = admin.firestore();
        const test = await db.collection("job_notifications").limit(1).get();
        res.send(`KaamSetu FCM Server Running | Firebase Connected | Docs: ${test.size}`);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/update-token', async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields: token or userId."
        });
    }
    try {
        const db = admin.firestore();
        await db.collection('users').doc(userId).update({ fcmToken: token });
        res.json({
            success: true,
            message: "Token updated successfully."
        });
    } catch (error) {
        console.error("Error updating token:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/send-job-notification', async (req, res) => {
    try {
        const { token, title, body, jobId } = req.body;
        if (!token || !title || !body) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: token, title, or body."
            });
        }
        const message = {
            notification: {
                title: title,
                body: body
            },
            data: {
                jobId: jobId || "",
                click_action: "FLUTTER_NOTIFICATION_CLICK"
            },
            token: token
        };
        console.log("Sending FCM payload:", message);
        const response = await admin.messaging().send(message);
        console.log("Successfully sent message:", response);
        res.json({
            success: true,
            message: "Notification sent successfully",
            messageId: response
        });
    } catch (error) {
        console.error("FCM Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});