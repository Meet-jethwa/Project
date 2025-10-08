require('dotenv').config();
const mongoose = require('mongoose');
const Request = require('./models/Request');

mongoose.connect(process.env.MONGO_URI, { dbName: 'teachers' })
  .then(async () => {
    console.log("🧹 Connected to MongoDB. Deleting accepted substitution requests...");
    const result = await Request.deleteMany({ status: { $regex: /^Accepted by /i } });
    console.log(`✅ Deleted ${result.deletedCount} accepted requests.`);
    process.exit();
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
