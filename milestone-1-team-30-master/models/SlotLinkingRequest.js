const mongoose = require("mongoose");
const slotLinkingRequestSchema = new mongoose.Schema({
    sender: String,
    recipient: String,
    course: String,
    day: String,
    start: String,
    end: String,
    location: String,
    status: String
});

module.exports = mongoose.model("SlotLinkingRequest", slotLinkingRequestSchema);