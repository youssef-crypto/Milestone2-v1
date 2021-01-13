const mongoose = require("mongoose");
const memberCountSchema = new mongoose.Schema({
    hr: Number,
    ac: Number,
    id: Number
});

module.exports = mongoose.model("MemberCount", memberCountSchema);