const mongoose = require("mongoose");
const leaveRequestSchema = new mongoose.Schema({
    type: String,
    sender: String,
    recipient: String,
    date: Date,
    compensationDate: Date,
    reason: String,
    status: String,
    rejectionReason: String,
    replacers: [String],
    documents: [String]
});

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);