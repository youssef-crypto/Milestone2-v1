const mongoose = require("mongoose");
const dayOffRequestSchema = new mongoose.Schema({
        sender: String,
        recipient: String,
        day: String,
        reason: String,
        status: String,
        rejectionReason: String
});

module.exports = mongoose.model("DayOffRequest", dayOffRequestSchema);