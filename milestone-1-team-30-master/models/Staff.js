const mongoose = require("mongoose");
const staffSchema = new mongoose.Schema({
    id : {
        type: String,
        required : true
    },
    username: {
        type: String,
        required: true,
        min: 1,
        max: 200
    },
    email: String,
    password: {
        type: String,
        required: true,
        min: 1,
        max: 1000
    },
    role: {
        type: String,
        required : true
    },
    profile: {
        gender: {
            type: String,
            required: true
        },
        displayName: {
            type: String
        },
        imgPath: {
            type: String
        }
    },
    signedIn: Boolean,
    date: {
        type: Date,
        default: new Date()
    },
    attendance: [{
        signIn: Date,
        signOut: Date
    }],
    signIn: Date,
    missingDays:[Date],
    minutes: Number,
    missingMinutes: Number,
    extraMinutes: Number,
    dayOff: String,
    salary: Number,
    faculty: String,
    department: String,
    courses: [String],
    schedule: [{
        day: String,
        slots: [{
            course: String,
            location: String,
            start: String,
            end: String,
            replacement: Date
        }]
    }],
    office: String,
    annualBalance: Number,
    annualLastAdded: Date,
    accidentalDays: Number,
    notifications: Number
});


module.exports = mongoose.model("Staff", staffSchema);