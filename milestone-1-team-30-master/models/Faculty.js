const mongoose = require("mongoose");
const facultySchema = new mongoose.Schema({
    name: String,
    department: [{
        name: String,
        head: String,
        course: [{
            name: String,
            instructor: [String],
            coordinator: String,
            slots: [{
                teacher: String,
                location: String,
                day: String,
                start: String,
                end: String
            }]
        }]
    }]
});

module.exports = mongoose.model("Faculty", facultySchema);