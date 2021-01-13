const mongoose = require("mongoose");
const replaceRequestSchema = new mongoose.Schema({
        sender: String,
        recipient: String,
        status: String,
        slot: {
            course: String,
            location: String,
            start: String,
            end: String,
            replacement: Date
        }
});

module.exports = mongoose.model("ReplaceRequest", replaceRequestSchema);