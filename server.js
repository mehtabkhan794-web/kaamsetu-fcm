const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// 1. Firebase Admin Initialize (सुरक्षित तरीके से)
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🚀 Firebase Admin Initialized Successfully");
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
    // प्रोडक्शन पर अगर फायरबेस इनिशियलाइज नहीं हुआ, तो सर्वर को बंद करना ही सही है ताकि रीस्टार्ट हो सके
    process.exit(1); 
}

const db = admin.firestore();

// 2. 🔥 ऑटोमैटिक लिसनर: async/await को संभालने के लिए for...of लूप का इस्तेमाल
function startFirestoreListener() {
    db.collection('job_notifications').onSnapshot(async (snapshot) => {
        const changes = snapshot.docChanges();
        
        // .forEach की जगह for...of ताकि async/await लाइन बाय लाइन सही से काम करे
        for (const change of changes) {
            if (change.type === 'added') {
                const data = change.doc.data();
                console.log(`🆕 New job notification detected [ID: ${change.doc.id}]`);

                const topicName = data.topic || data.topicName; 
                const notificationTitle = data.title || "नया काम उपलब्ध है!";
                const notificationBody = data.body || "ऐप खोलकर पूरी जानकारी देखें।";
                const jobId = data.jobId ? data.jobId.toString() : "";

                if (topicName) {
                    const message = {
                        notification: {
                            title: notificationTitle,
                            body: notificationBody
                        },
                        data: {
                            jobId: jobId,
                            click_action: "FLUTTER_NOTIFICATION_CLICK"
                        },
                        topic: topicName
                    };

                    try {
                        console.log(`📡 Sending FCM to topic [${topicName}]...`);
                        const response = await admin.messaging().send(message);
                        console.log(`✅ Successfully sent message to topic [${topicName}]:`, response);
                    } catch (fcmError) {
                        console.error(`❌ FCM Error for topic [${topicName}]:`, fcmError.message);
                    }
                } else {
                    console.log(`⚠️ Notification skipped for doc [${change.doc.id}]: No topic found.`);
                }
            }
        }
    }, (error) => {
        console.error("❌ Firestore Listener Crashed, Restarting in 5s...", error.message);
        // अगर नेटवर्क टूटने से लिसनर क्रैश होता है, तो 5 सेकंड बाद दोबारा शुरू करें
        setTimeout(startFirestoreListener, 5000);
    });
}

// 🔥 3. ऑटोमैटिक लिसनर (Worker Interest): user_notifications कलेक्शन के लिए
function startInterestListener() {
    db.collection('user_notifications').onSnapshot(async (snapshot) => {
        const changes = snapshot.docChanges();

        for (const change of changes) {
            if (change.type === 'added') {
                const docData = change.doc.data();
                
                // सिर्फ 'INTEREST' टाइप वाले डॉक्यूमेंट्स को ही प्रोसेस करेंगे
                if (docData.data && docData.data.type === 'INTEREST') {
                    console.log(`💼 New Interest detected [ID: ${change.doc.id}]`);

                    // स्क्रीनशॉट स्ट्रक्चर के हिसाब से सही वेरिएबल्स निकालना
                    const ownerId = docData.toId; 
                    const jobId = docData.data ? (docData.data.jobId ? docData.data.jobId.toString() : "") : "";
                    
                    // अगर डॉक्यूमेंट में body है (जैसे: "Mehtab Khan is interested") तो वो उठाएगा, नहीं तो डिफ़ॉल्ट टेक्स्ट
                    const notificationBody = docData.notification && docData.notification.body 
                        ? docData.notification.body 
                        : "एक वर्कर ने आपकी जॉब में इंटरेस्ट दिखाया है।";

                    if (ownerId) {
                        try {
                            // मलिक (Owner) का डेटा 'users' कलेक्शन से निकालें
                            const userDoc = await db.collection('users').doc(ownerId).get();
                            
                            if (!userDoc.exists) {
                                console.log(`⚠️ Owner with ID [${ownerId}] not found in users collection.`);
                                continue;
                            }

                            const fcmToken = userDoc.data().fcmToken;

                            if (fcmToken) {
                                const message = {
                                    notification: {
                                        // 🌟 मलीक के लिए टाइटल यहाँ पर हमेशा फिक्स रहेगा
                                        title: "New Worker Interested! 💼",
                                        body: notificationBody
                                    },
                                    data: {
                                        jobId: jobId,
                                        type: "interest_received",
                                        click_action: "FLUTTER_NOTIFICATION_CLICK"
                                    },
                                    token: fcmToken,
                                    android: {
                                        priority: "high", // तुरंत डिलीवरी के लिए
                                        notification: {
                                            // 🌟 मलीक के लिए डिफ़ॉल्ट चैनल और डिफ़ॉल्ट टोन सेट कर दी है
                                            channelId: "kaamsetu_general_alerts",
                                            sound: "default"
                                        }
                                    }
                                };

                                console.log(`📡 Sending Interest FCM to Owner [ID: ${ownerId}]...`);
                                const response = await admin.messaging().send(message);
                                console.log(`✅ Successfully sent interest notification to Owner:`, response);
                            } else {
                                console.log(`⚠️ FCM Token not found for Owner [ID: ${ownerId}].`);
                            }
                        } catch (error) {
                            console.error(`❌ Error processing interest notification for Owner [${ownerId}]:`, error.message);
                        }
                    } else {
                        console.log(`⚠️ Interest skipped for doc [${change.doc.id}]: No toId (ownerId) found.`);
                    }
                }
            }
        }
    }, (error) => {
        console.error("❌ Interest Listener Crashed, Restarting in 5s...", error.message);
        setTimeout(startInterestListener, 5000);
    });
}

// दोनों लिस्टनर्स को चालू करें
startFirestoreListener();
startInterestListener();
console.log("📡 Firestore listeners attached to 'job_notifications' and 'user_notifications'");


// 4. API Endpoints (UptimeRobot इसी एंडपॉइंट को चेक करेगा)
app.get("/", async (req, res) => {
    try {
        // यह चेक करने के लिए कि फायरबेस सच में कनेक्टेड है या नहीं
        const test = await db.collection("job_notifications").limit(1).get();
        res.send(`KaamSetu FCM Server Running | Firebase Connected | Docs: ${test.size}`);
    } catch (error) {
        console.error("❌ Root Endpoint Error:", error.message);
        res.status(500).send(`Server Error: ${error.message}`);
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
        // .update() की जगह .set with merge: true ताकि अगर यूजर डॉक न भी हो, तो एरर न आए
        await db.collection('users').doc(userId).set({ fcmToken: token }, { merge: true });
        res.json({
            success: true,
            message: "Token updated successfully."
        });
    } catch (error) {
        console.error("❌ Error updating token:", error.message);
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
            notification: { title, body },
            data: {
                jobId: jobId ? jobId.toString() : "",
                click_action: "FLUTTER_NOTIFICATION_CLICK"
            },
            token: token
        };

        console.log("Sending Individual FCM...");
        const response = await admin.messaging().send(message);
        res.json({
            success: true,
            message: "Notification sent successfully",
            messageId: response
        });
    } catch (error) {
        console.error("❌ Single FCM Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});