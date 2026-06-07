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

// 🔥 ऑटोमैटिक लिसनर: Firestore में नया जॉब आते ही नोटिफिकेशन भेजेगा
try {
    const db = admin.firestore();
    db.collection('job_notifications').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const data = change.doc.data();
                console.log("New job notification detected in Firestore:", data);

                // डेटा से जरूरी चीजें निकालना (आपकी ऐप के फील्ड्स के नाम के हिसाब से)
                const topicName = data.topic || data.topicName; 
                const notificationTitle = data.title || "नया काम उपलब्ध है!";
                const notificationBody = data.body || "ऐप खोलकर पूरी जानकारी देखें।";
                const jobId = data.jobId || "";

                // अगर टॉपिक मिल जाता है, तो तुरंत FCM नोटिफिकेशन ट्रिगर करो
                if (topicName) {
                    const message = {
                        notification: {
                            title: notificationTitle,
                            body: notificationBody
                        },
                        data: {
                            jobId: jobId.toString(),
                            click_action: "FLUTTER_NOTIFICATION_CLICK"
                        },
                        topic: topicName // यहाँ टोकन की जगह टॉपिक का इस्तेमाल हो रहा है
                    };

                    try {
                        console.log(`Sending FCM to topic [${topicName}]...`);
                        const response = await admin.messaging().send(message);
                        console.log(`Successfully sent message to topic [${topicName}]:`, response);
                    } catch (fcmError) {
                        console.error(`FCM Error for topic [${topicName}]:`, fcmError.message);
                    }
                } else {
                    console.log("⚠️ Notification skipped: No topic found in this document.");
                }
            }
        });
    });
    console.log("Firestore listener attached to 'job_notifications'");
} catch (error) {
    console.error("Error attaching Firestore listener:", error);
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});