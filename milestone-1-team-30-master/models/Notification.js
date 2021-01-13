const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
    user: String,
    message: String,
    date: Date
});

module.exports = mongoose.model("Notification", notificationSchema);