const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const moment = require('moment');
var schedule = require('node-schedule');
dotenv.config();
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
const Staff = require("./models/Staff");
const Faculty = require("./models/Faculty");
const ReplaceRequest = require("./models/ReplaceRequest");
const SlotLinkingRequest = require("./models/SlotLinkingRequest");
const DayOffRequest = require("./models/DayOffRequest");
const LeaveRequest = require("./models/LeaveRequest");
const Notification = require("./models/Notification");
const Location = require("./models/Location");
const MemberCount = require("./models/MemberCount");
const verify = require("./verifyToken");
const { findOneAndUpdate, findById } = require("./models/Staff");
const { request } = require("express");
const cors = require("cors")
app.use(cors())

// connect to db 
mongoose.connect(process.env.DB_CONNECT, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true, useFindAndModify: false })
    .then((result) => {
        console.log("successfully connected to db");
        app.listen(process.env.PORT, process.env.IP, () => {
            console.log("Server has started!!!!!!!!!");
        });
    })
    .catch((err) => { console.log(err) });

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { Scheduler }

    var scheduler = schedule.scheduleJob({hour: 23, minute: 59}, async function(){
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        let today = new Date();
        today.setHours(0,0,0,0);
        const allStaff = await Staff.find({});
        const leaves = await LeaveRequest.find({date: today, status: "A"});
        for (let staff of allStaff) {
            const isDayOff = (days[today.getDay()] === "Friday") || (days[today.getDay()] === staff.dayOff);
            const lastAttendance = staff.attendance.pop();
            const requests = leaves.filter(request => {
                return request.sender === staff.username;
            });
            if ( (!isDayOff) && (requests.length === 0)) { // not day-off and no accepted requests on this day
                staff.missingMinutes += staff.minutes;
                if (lastAttendance.signIn.getDate() !== today.getDate()) {
                    staff.missingDays.push(today);
                }
            } 
            if (staff.missingMinutes > 0 && staff.extraMinutes > 0) {
                if (staff.missingMinutes >= staff.extraMinutes) {
                    staff.missingMinutes -= staff.extraMinutes;
                    staff.extraMinutes = 0;
                }
                else {
                    staff.extraMinutes -= staff.missingMinutes;
                    staff.missingMinutes = 0;
                }
            }
            if (today.getDate() === 10) { // end of month
                staff.missingDays = [];
                staff.missingMinutes = 0;
                staff.extraMinutes = 0;
                console.log("Salary to be computed in milestone 2");
            }
            await Staff.updateOne({username: staff.username}, {"$set": {signedIn: false, missingDays: staff.missingDays, minutes: 504, missingMinutes: staff.missingMinutes, extraMinutes: staff.extraMinutes}});
        }
        console.log("Scheduler has executed.");
    });

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { GUC Staff Members Functionalities }

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).send("Input is invalid");
        }
        if (!username || !password) {
            return res.status(400).send("Please Enter a Valid Username and Password");
        }
        const staff = await Staff.findOne({ username: username });
        if (!staff) {
            return res.status(400).send("Staff is Not Registered");
        }
        const trueStaff = await bcrypt.compare(password, staff.password);
        //console.log(trueStaff);
        if (!trueStaff) {
            return res.status(400).send("Invalid Username or Password");
        }
        //res.send(staff);

        // Create and Assign token
        jwtPassword = process.env.TOKEN_SECRET;
        const token = jwt.sign({ username: staff.username, role: staff.role }, jwtPassword, { expiresIn: "1h" });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.header("auth-token", token).json({token:token , role: staff.role});
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/logout", verify, (req, res) => {
    // let random = Math.floor(Math.random() * (100000 - 1) + 1);
    // process.env.TOKEN_SECRET = process.env.TOKEN_SECRET.concat(random);
    // console.log(process.env.TOKEN_SECRET);
    res.send("You have logged out successfully");
});

app.put("/updateProfile", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    const filter = { username: staffUsername };
    let { gender, displayName, imgPath } = req.body;
    if (typeof gender !== 'string' || typeof displayName !== 'string' || typeof imgPath !== 'string') {
        return res.send("Input is invalid");
    }
    try {
        let foundStaff = await Staff.findOne(filter);
        if (!gender) {
            gender = foundStaff.profile.gender;
        }
        if (!displayName) {
            displayName = foundStaff.profile.displayName;
        }
        if (!imgPath) {
            imgPath = foundStaff.profile.imgPath;
        }
        await Staff.findOneAndUpdate(filter, {
            profile:
            {
                gender: gender,
                displayName: displayName,
                imgPath: imgPath
            }
        });
        res.send("Profile Updated Successfully");
    }
    catch (err) {
        res.send(err);
    }
});

app.get("/viewProfile", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    //console.log(staffId);
    try {
        let foundStaff = await Staff.findOne({ username: staffUsername });
        const response = {
            gender: foundStaff.profile.gender,
            imgPath: foundStaff.profile.imgPath,
            displayName: foundStaff.profile.displayName,
            salary: foundStaff.salary,
            missingDays: foundStaff.missingDays.length,
            missingMinutes: foundStaff.missingMinutes
        };
        res.send(response);
    }
    catch (err) {
        res.send(err);
    }
});

app.put("/resetPassword", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    let oldPassword = req.body.oldPassword;
    if (typeof oldPassword !== 'string' || typeof (req.body.newPassword) !== 'string') {
        return res.status(400).send("Input is invalid");
    }
    if (!oldPassword) {
        res.status(400).send("Please Enter your old password")
    }
    try {
        let foundStaff = await Staff.findOne({ username: staffUsername });
        let truePassword = await bcrypt.compare(oldPassword, foundStaff.password);
        if (truePassword) {
            let newPassword = req.body.newPassword;
            let salt2 = await bcrypt.genSalt();
            let hashedPassword2 = await bcrypt.hash(newPassword, salt2);
            await Staff.findOneAndUpdate({ username: staffUsername }, { password: hashedPassword2 });
            res.send("Password Changed Successfully");
        }
        else {
            res.status(400).send("Invalid old password")
        }

    }
    catch (err) {
        res.send(err);
    }

});

app.put("/signInToCampus", verify, async (req, res) => {
    const { username, role } = req.staff;
    try {
        const user = await Staff.findOne({ username: username });
        await Staff.findOneAndUpdate({ username: username }, {"$set": {signedIn: true, signIn: (new Date())}});
        res.send("Signed in successfully");
    }
    catch (err) {
        res.send(err);
    }
});

app.put("/signOutFromCampus", verify, async (req, res) => {
    const { username, role } = req.staff;
    try {
        const user = await Staff.findOne({ username: username });
        if (user.signedIn) {
            const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
            const dayName = days[(new Date()).getDay()];
            let sevenAM = new Date();
            sevenAM.setHours(7,0,0,0);
            let sevenPM = new Date();
            sevenPM.setHours(19,0,0,0);
            const durationBefore = moment(sevenAM).diff(moment(user.signIn), 'minutes'); //before 7AM
            const durationAfter = moment().diff(moment(sevenPM), 'minutes'); //after 7PM
            let durationTotal = moment().diff(moment(user.signIn), 'minutes');
            if (durationBefore > 0) {
                durationTotal -= durationBefore; // neglecting before 7Am
            }
            if (durationAfter > 0) {
                durationTotal -= durationAfter; // neglecting after 7PM
            }
            if (durationTotal > 0) {
                if (dayName !== "Friday" && dayName !== user.dayOff) { // if not day-off
                    const extraMinutes = (durationTotal > user.minutes) ? (durationTotal - user.minutes) : 0;
                    user.minutes = (user.minutes > durationTotal) ? (user.minutes - durationTotal) : 0;
                    user.extraMinutes += extraMinutes;
                }
                else { // if day-off
                    user.extraMinutes += durationTotal;
                }
            }
            user.attendance.push({
                signIn: user.signIn,
                signOut: (new Date())
            });
            await Staff.updateOne({username: username}, {"$set": {signedIn: false, attendance: user.attendance, minutes: user.minutes, extraMinutes: user.extraMinutes}});
            res.send("Signed out successfully");
        }
        else {
            res.send("You are not signed in");
        }
    }
    catch (err) {
        res.send(err);
    }
});


app.get("/viewAttendance", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    try {
        const foundStaff = await Staff.findOne({ username: staffUsername });
        res.send(foundStaff.attendance);
    }
    catch (err) {
        res.send(err);
    }
});

app.post("/viewAttendanceByMonth", verify, async (req, res) => {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    let staffUsername = req.staff.username;
    let month = req.body.month;
    if (typeof month !== 'string') {
        return res.status(400).send("Input is invalid");
    }
    try {
        const foundStaff = await Staff.findOne({ username: staffUsername });
        let foundStaffAttendance = foundStaff.attendance;
        let attendanceMonth = foundStaffAttendance.filter(record => monthNames[record.signIn.getMonth()] == month);
        res.send(attendanceMonth);
    }
    catch (err) {
        res.status(400).send(err);
    }
});

app.get("/viewMissingDays", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    try {
        const foundStaff = await Staff.findOne({ username: staffUsername });
        const missing = foundStaff.missingDays.map((record) => {
            return moment(record).format('MMMM Do YYYY');
        });
        res.send(missing);
    }
    catch (err) {
        res.send(err);
    }
});

app.get("/viewMissingExtraHours", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    try {
        const foundStaff = await Staff.findOne({ username: staffUsername });
        const missingHours = Math.floor(foundStaff.missingMinutes / 60);
        const missingMinutes = foundStaff.missingMinutes % 60;
        const extraHours = Math.floor(foundStaff.extraMinutes / 60);
        const extraMinutes = foundStaff.extraMinutes % 60;
        const view = {
            missingHours: missingHours + " hours",
            missingMinutes: missingMinutes + " minutes",
            extraHours: extraHours + " hours",
            extraMinutes: extraMinutes + " minutes"
        };
        res.send(view);
    }
    catch (err) {
        res.send(err);
    }
});

app.get("/", verify, async (req, res) => {
    let staffUsername = req.staff.username;
    foundStaff = await Staff.findOne({ username: staffUsername });
    res.send(foundStaff);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { HR Functionalities }

app.post("/hrAddStaff", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        let { username, password, role, gender, imgPath, displayName, salary, faculty, department,
            officeLocation, dayOff } = req.body;
        if (typeof username !== 'string' || typeof password !== 'string' || typeof role !== 'string' ||
            typeof gender !== 'string' || typeof displayName !== 'string' ||
            typeof officeLocation !== 'string' || typeof dayOff !== 'string' || typeof salary !== 'number'
            || typeof faculty !== 'string' || typeof department !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const existStaff = await Staff.findOne({ username: username });
            if (existStaff) {
                return res.send("Username taken");
            }
            const pass = (!password) ? "123456" : password;

            if (role == "HR") {
                if (dayOff != "Saturday") {
                    return res.send("HR members always have Saturday as their dayOff!")
                }
            }
            const findLocation = await Location.findOne({ location_name: officeLocation });
            const findFaculty = await Faculty.findOne({ name: faculty });
            if (findFaculty) {
                const depart = findFaculty.department.find(dep => dep.name == department);
                const depIndex = findFaculty.department.indexOf(depart);
                if (depIndex == -1) {
                    return res.send("There is no existing department with the name you entered");
                }
            } else {
                return res.send("Faculty can not be found!")
            }
            if (!findLocation) {
                return res.send("Location not found!");
            }
            if (findLocation.location_type !== "Office") {
                return res.send("The following location is not an office!")
            }
            if (findLocation.occupiedPlaces >= findLocation.capacity) {
                return res.send("The following location is full, please choose another one!")
            } else {
                findLocation.occupiedPlaces += 1
            }
            await Location.updateOne({ location_name: officeLocation },
                { occupiedPlaces: findLocation.occupiedPlaces })
            if (!role) {
                return res.send("You have to specifiy the role!")
            }
            if (!faculty || !department) {
                return res.send("You have to specifiy your faculty and department!")
            }
            if (!username) {
                return res.send("Please Enter a Valid Username");
            }
            if (!displayName) {
                displayName = displayName;
            }
            if (!imgPath) {
                if (gender == "male") {
                    imgPath = "https://www.pngitem.com/pimgs/m/504-5040528_empty-profile-picture-png-transparent-png.png";
                }
                else {
                    imgPath = "https://i.pinimg.com/originals/d1/ad/13/d1ad13605acd060cbcc4b334e2119883.png";
                }
            }
            const count = await MemberCount.findOne({ id: 2020 })
            let hrCount = count.hr
            let acCount = count.ac
            let ID;

            if (role === "HR") {
                ID = "hr-";
                ID += hrCount.toString()
                hrCount++
            } else {
                ID = "ac-";
                ID += acCount.toString()
                acCount++
            }
            await MemberCount.updateOne({ id: 2020 }, { "$set": { hr: hrCount, ac: acCount } })

            const salt = await bcrypt.genSalt();
            const hashedPassword = await bcrypt.hash(pass, salt);
            const newStaff = new Staff({
                username: username,
                email: username.concat("@guc.edu.eg"),
                password: hashedPassword,
                role: role,
                id: ID,
                profile: {
                    gender: gender,
                    displayName: displayName,
                    imgPath: imgPath
                },
                signedIn: false,
                dayOff: dayOff,
                salary: salary,
                office: officeLocation,
                attendance: [],
                signIn: null,
                minutes: 0,
                missingMinutes: 0,
                extraMinutes: 0,
                missingDays: [],
                courses: [],
                schedule: [],
                annualBalance: 2.5,
                annualLastAdded: new Date(),
                acciedntalDays: 6,
                notifications: 0,
                missingHours: 0,
                extraHours: 0,
                faculty: faculty,
                department: department,
                date: new Date()
            });
            newStaff.save()
                .then(() => { res.send("Staff member is added") })
                .catch((err) => { res.send(err) });
        } catch (err) {
            return res.status(400).json({ message: err.message })
        }
    } else {
        res.send("You are not authorized to add new staff members");
    }
});

app.post("/hrAddLocation", verify, async (req, res) => {
    const staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.location_name !== 'string' || typeof req.body.location_type !== 'string' ||
            typeof req.body.capacity !== 'number' || typeof req.body.occupiedPlaces !== 'number') {
            return res.send("Invalid input data type!")
        }
        let same_loc = await Location.findOne({ location_name: req.body.location_name });
        if (!same_loc) {
            const location = new Location({
                location_name: req.body.location_name,
                location_type: req.body.location_type,
                capacity: req.body.capacity,
                occupiedPlaces: req.body.occupiedPlaces
            });
            location.save()
                .then(result => {
                    res.send("Location added successfully!")
                })
                .catch(err => { res.send(err) })
        } else {
            return res.send("Location already exists!")
        }
    } else {
        return res.send("You are not authorized to add any Locations");
    }
});
//update location
app.put("/hrUpdateLocation", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.location_name !== 'string' || typeof req.body.updatedLocation_name !== 'string'
            || typeof req.body.updatedLocation_type !== 'string' || typeof req.body.updatedCapacity !== 'number'
            || typeof req.body.updatedOccupiedPlaces !== 'number') {
            return res.send("Invalid input data type!")
        }
        try {
            const findLocation = await Location.findOne({ location_name: req.body.location_name });
            if (findLocation == null) {
                return res.send("Location can not be Found!")
            }
            res.findLocation = findLocation
            if (req.body.updatedLocation_name != null) {
                res.findLocation.location_name = req.body.updatedLocation_name
            }
            if (req.body.updatedLocation_type != null) {
                res.findLocation.location_type = req.body.updatedLocation_type
            }
            if (req.body.updatedCapacity != null) {
                res.findLocation.capacity = req.body.updatedCapacity
            }
            if (req.body.updatedOccupiedPlaces != null &&
                req.body.updatedOccupiedPlaces <= req.body.updatedCapacity) {
                res.findLocation.occupiedPlaces = req.body.updatedOccupiedPlaces
            } else {
                return res.send("Occupied places can not be greater than capacity of the location")
            }

            const updatedLocation = res.findLocation.save()
            return res.send('Location is updated!')

        } catch (err) {
            return res.status(400).json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//delete location
app.post("/hrDeleteLocation", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.location_name !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            let location = await Location.findOne({ location_name: req.body.location_name });
            if (location == null) {
                return res.status(404).json({ message: 'Cannot find Location' })
            }
            res.location = location
        } catch (err) {
            res.status(500).json({ message: err.message })
        }
        try {
            await res.location.remove()
            res.send('Location is deleted')
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

// add faculty
app.post("/hrAddFaculty", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.name !== 'string') {
            return res.send("Invalid input data type!")
        }
        let same_faculty = await Faculty.findOne({ name: req.body.name });
        if (!same_faculty) {
            const faculty = new Faculty({
                name: req.body.name,
                department: []
            });
            faculty.save()
                .then(result => {
                    res.send("Faculty is added!")
                })
                .catch(err => { res.send(err) })
        } else {
            return res.send("Faculty already exists!")
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//update faculty
app.put("/hrUpdateFaculty", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.facultyName !== 'string' || typeof req.body.updatedName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const faculty = await Faculty.findOne({ name: req.body.facultyName });
            const existfaculty = await Faculty.findOne({ name: req.body.updatedName })
            if (faculty == null) {
                return res.send('Cannot find Faculty')
            }
            if (existfaculty) {
                return res.send("Faculty already exists")
            }
            res.faculty = faculty
            if (req.body.facultyName != null) {
                res.faculty.name = req.body.updatedName
            }
            const updatedFaculty = res.faculty.save();
            res.send("Faculty is updated")
        } catch (err) {
            return res.send({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//delete Faculty
app.post("/hrDeleteFaculty", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.facultyName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            let faculty = await Faculty.findOne({ name: req.body.facultyName })
            if (faculty == null) {
                return res.send('Cannot find Faculty')
            }
            res.faculty = faculty

        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
        try {
            await res.faculty.remove()
            res.send('Faculty deleted')
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//add department
app.post("/hrAddDepartment", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { facultyName, departmentName } = req.body;
    if (role === "HR") {
        if (typeof req.body.facultyName !== 'string' || typeof req.body.departmentName !== 'string') {
            return res.send("Invalid input data type!")
        }
        const faculty = await Faculty.findOne({ name: facultyName });
        if (faculty) {
            for (let i = 0; i < faculty.department.length; i++) {
                if (faculty.department[i].name !== departmentName) {
                    continue;
                } else {
                    return res.send("Department already exists in that faculty")
                }
            }
            faculty.department.push({
                name: departmentName,
                head: "",
                course: []
            });
            await Faculty.updateOne({ name: facultyName }, { department: faculty.department });
            return res.send("Department added successfully");
        }
        else {
            return res.send("There is no faculty with that name");
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});

//update department
app.put("/hrUpdateDepartment", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "HR") {
        const { facultyName, departmentName, newdepartmentName } = req.body;
        if (typeof facultyName !== 'string' || typeof departmentName !== 'string' || typeof newdepartmentName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const faculty = await Faculty.findOne({ name: req.body.facultyName });
            //console.log(faculty);
            if (faculty) {
                const depart = faculty.department.find(dep => dep.name == departmentName);
                const newdepart = faculty.department.find(dep => dep.name == newdepartmentName);
                //console.log(depart);
                const depIndex = faculty.department.indexOf(depart);
                const newdepIndex = faculty.department.indexOf(newdepart)
                if (depIndex == -1) {
                    return res.send("There is no existing department with the name you entered");
                }if(newdepIndex == -1){
                    faculty.department[depIndex].name = newdepartmentName;
                    await Faculty.findOneAndUpdate({ name: facultyName }, { department: faculty.department });
                }
                else {
                    return res.send("Department already exists")
                }
                return res.send("Department is updated");
            }
            else {
                return res.send("There is no faculty with that name");
            }
        } catch (err) {
            return res.send("Something went wrong!")
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});

//delete department
app.post("/hrDeleteDepartment", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "HR") {
        const { facultyName, departmentName } = req.body;
        if (typeof facultyName !== 'string' || typeof departmentName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const faculty = await Faculty.findOne({ name: req.body.facultyName });
            //console.log(faculty);
            if (faculty) {
                const depart = faculty.department.find(dep => dep.name == departmentName);
                //console.log(depart);
                depIndex = faculty.department.indexOf(depart);
                if (depIndex == -1) {
                    return res.send("There is no existing department with the name you entered");
                }
                else {
                    foundDep = faculty.department.splice(depIndex, 1);
                    await Faculty.findOneAndUpdate({ name: facultyName }, { department: faculty.department });
                }
                res.send("Department is deleted");
            }
            else {
                res.send("There is no faculty with that name");
            }
        } catch (err) {
            return res.send("Wrong data!")
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});


//add course under department
app.post("/hrAddCourse", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "HR") {
        const { facultyName, departmentName, courseName } = req.body;
        if (typeof facultyName !== 'string' || typeof departmentName !== 'string' || typeof courseName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const faculty = await Faculty.findOne({ name: facultyName });
            if (faculty) {
                const depart = faculty.department.find(dep => dep.name == departmentName);
                //console.log(depart);
                const depIndex = faculty.department.indexOf(depart);
                if (depIndex == -1) {
                    return res.send("There is no existing department with the name you entered");
                } else {
                    for (let i = 0; i < faculty.department.length; i++) {
                        for (let j = 0; j < faculty.department[i].course.length; j++) {
                            if (faculty.department[i].name === departmentName) {
                                if (faculty.department[i].course[j].name !== courseName) {
                                    continue;
                                } else {
                                    return res.send("The course already exists in that department!")
                                }
                            }
                        }
                        faculty.department[i].course.push({
                            name: courseName,
                            instructor: [],
                            slots: []
                        })
                        break;
                    }
                    await Faculty.findOneAndUpdate({ "department.name": departmentName }, { department: faculty.department });
                    return res.send("A course is added")
                }
            } else {
                return res.send("There is no existing faculty with the name you entered")
            }
        } catch (err) {
            return res.send("Wrong data!")
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});

//update course under department
app.put("/hrUpdateCourse", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "HR") {
        const { facultyName, departmentName, courseName, newCourseName } = req.body;
        if (typeof facultyName !== 'string' || typeof departmentName !== 'string' || typeof courseName !== 'string'
            || typeof newCourseName !== 'string') {
            return res.send("Invalid input data type!")
        }
        const faculty = await Faculty.findOne({ name: req.body.facultyName });
        //console.log(faculty);
        if (faculty) {
            const depart = faculty.department.find(dep => dep.name == departmentName);
            //console.log(depart);
            const depIndex = faculty.department.indexOf(depart);
            if (depIndex == -1) {
                return res.send("There is no existing department with the name you entered");
            }
            else {
                const findCourse = faculty.department[depIndex].course.find(course => course.name == courseName)
                const courseIndex = faculty.department[depIndex].course.indexOf(findCourse)
                const findNewCourse = faculty.department[depIndex].course.find(course => course.name == newCourseName)
                const newcourseIndex = faculty.department[depIndex].course.indexOf(findNewCourse)
                if (courseIndex == -1) {
                    return res.send("There is no course with that name")
                }if(newcourseIndex == -1){
                    faculty.department[depIndex].course[courseIndex].name = newCourseName;
                    await Faculty.findOneAndUpdate({ name: facultyName },
                        { department: faculty.department });
                }
                else {
                    return res.send("The entered course already exists")
                }
            }
            res.send("The course is updated");
        }
        else {
            return res.send("There is no faculty with that name");
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});

//delete course under department
app.post("/hrDeleteCourse", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { facultyName, departmentName, courseName } = req.body;
    if (typeof facultyName !== 'string' || typeof departmentName !== 'string' || typeof courseName !== 'string') {
            return res.send("Invalid input data type!")
        }
    if (role === "HR") {
        const faculty = await Faculty.findOne({ name: req.body.facultyName });
        //console.log(faculty);
        if (faculty) {
            const depart = faculty.department.find(dep => dep.name == departmentName);
            //console.log(depart);
            depIndex = faculty.department.indexOf(depart);
            if (depIndex == -1) {
                return res.send("There is no existing department with the name you entered");
            }
            else {
                const findCourse = faculty.department[depIndex].course.find(course => course.name == courseName)
                const courseIndex = faculty.department[depIndex].course.indexOf(findCourse)
                if (courseIndex == -1) {
                    return res.send("There is no course with that name")
                }
                else {
                    faculty.department[depIndex].course.splice(courseIndex, 1)
                    await Faculty.findOneAndUpdate({ name: facultyName },
                        { department: faculty.department });
                }
            }
            res.send("The course is deleted");
        }
        else {
            return res.send("There is no faculty with that name");
        }
    }
    else {
        return res.send("You are not authorized to do this functionality");
    }
});

//update salary
app.put("/hrUpdateSalary", verify, async (req, res) => {
    let staffRole = req.staff.role;
    let staff = await Staff.findOne({ username: req.body.username })
    if (typeof req.body.username !== 'string' || typeof req.body.newSalary !== 'number') {
            return res.send("Invalid input data type!")
        }
    if (staffRole == "HR") {
        if (staff == null) {
            return res.send('User not found')
        }
        res.staff = staff
        res.staff.salary = req.body.newSalary
        try {
            await res.staff.save()
            res.json("Salary is updated!")
        } catch (err) {
            res.json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//update existing staffMember
app.put("/hrUpdateStaff", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if (typeof req.body.username !== 'string' || typeof req.body.oldOffice !== 'string' || typeof req.body.office !== 'string'
            || typeof req.body.role !== 'string' || typeof req.body.dayOff !== 'string' || typeof req.body.faculty !== 'string'
            || typeof req.body.department !== 'string' || typeof req.body.gender !== 'string' || typeof req.body.displayName !== 'string') {
            return res.send("Invalid input data type!")
        }
        try {
            const findstaff = await Staff.findOne({ username: req.body.username })
            const StaffLocation = await Staff.findOne({ office: req.body.oldOffice })
            const oldLocation = await Location.findOne({ location_name: req.body.oldOffice })
            const findLocation = await Location.findOne({ location_name: req.body.office })
            const findFaculty = await Faculty.findOne({ name: req.body.faculty })
            const count = await MemberCount.findOne({ id: 2020 })
            let hrCount = count.hr
            let acCount = count.ac
            let ID;
            if (findstaff == null) {
                return res.send('Cannot find staff member')
            }
            if (!findFaculty) {
                res.send("Faculty not found!")
            } else {
                const depart = findFaculty.department.find(dep => dep.name == req.body.department);
                const depIndex = findFaculty.department.indexOf(depart);
                if (depIndex == -1) {
                    return res.send("There is no department with the name you entered in that faculty");
                }
            }
            res.findstaff = findstaff
            if (req.body.dayOff != null) {
                if (req.body.role == "HR") {
                    res.findstaff.dayOff = "Saturday"
                }
                else {
                    res.findstaff.dayOff = req.body.dayOff
                }
            }
            if (req.body.role == "HR" && req.body.role !== findstaff.role) {
                ID = "hr-"
                ID += hrCount.toString()
                hrCount++
                res.findstaff.id = ID
            }
            if (req.body.role != "HR" && req.body.role !== findstaff.role) {
                ID = "ac-"
                ID += acCount.toString()
                acCount++
                res.findstaff.id = ID
            }
            await MemberCount.updateOne({ id: 2020 }, { "$set": { hr: hrCount, ac: acCount } })

            if (findLocation == null || oldLocation == null) {
                return res.send("Location not found!");
            }
            if (StaffLocation) {
                if ((findLocation.occupiedPlaces < findLocation.capacity) &&
                    (findLocation.location_type === "Office") &&
                    (req.body.office !== req.body.oldOffice)) {
                    findLocation.occupiedPlaces += 1
                    oldLocation.occupiedPlaces -= 1
                    res.findstaff.office = req.body.office
                }
            } else {
                return res.send("Current location is not correct!")
            }
            await Location.updateOne({ location_name: req.body.office },
                { occupiedPlaces: findLocation.occupiedPlaces })
            await Location.updateOne({ location_name: req.body.oldOffice },
                { occupiedPlaces: oldLocation.occupiedPlaces })

            if (req.body.role != null) {
                res.findstaff.role = req.body.role
            }
            if (req.body.department != null) {
                res.findstaff.department = req.body.department
            }
            if (req.body.faculty != null) {
                res.findstaff.faculty = req.body.faculty
            }
            if (req.body.gender != null) {
                res.findstaff.profile.gender = req.body.gender
            }
            if (req.body.displayName != null) {
                res.findstaff.profile.displayName = req.body.displayName
            }
            await res.findstaff.save()
            return res.send("Staff updated!")
        }
        catch (err) {
            res.status(400).json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//delete staff
app.post("/hrDeleteStaff", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        try {
            if(typeof req.body.username !== 'string'|| typeof req.body.officeName !== 'string'){
                return res.send("Invalid input data type!")
            }
            const findstaff = await Staff.findOne({ username: req.body.username })
            const findLocation = await Location.findOne({ location_name: req.body.officeName })
            if (findstaff == null) {
                return res.send('Cannot find staff member')
            }
            if (findstaff.office != req.body.officeName) {
                return res.send("Wrong location!")
            }
            if (findLocation == null) {
                return res.send("Location not found!")
            } else {
                findLocation.occupiedPlaces -= 1
            }
            await Location.updateOne({ location_name: req.body.officeName }, { occupiedPlaces: findLocation.occupiedPlaces })

            res.findstaff = findstaff
            await res.findstaff.remove()
            res.send('Staff member deleted')
        } catch (err) {
            res.status(500).json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//View staffmemebers with missing hours/days
app.get('/hrViewMissingHoursMissingDays', verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        try {
            const foundStaff = await Staff.find({});
            const getstaff = foundStaff.filter(staff =>{
                return staff.missingMinutes > 0 || staff.missingDays.length !== 0 
            });
            res.send(getstaff)
        } catch (err) {
            res.json({ message: err.message })
        }
    } else {
        return res.send("You are not authorized to do this functionality");
    }
});

//View any staff member attendance record
app.post("/hrViewAttendance", verify, async (req, res) => {
    let staffRole = req.staff.role;
    if (staffRole == "HR") {
        if(typeof req.body.username !== 'string'){
            return res.status(400).send("Invalid input data type!")
        }
        let staffUsername = req.body.username;
        try {
            const foundStaff = await Staff.findOne({ username: staffUsername });
            const att = foundStaff.attendance
            res.send(att);
        }
        catch (err) {
            res.status(400).send(err);
        }
    } else {
        return res.status(400).send("You are not authorized to do this functionality");
    }
});

app.post("/hrAddSignInSignOut", verify, async (req, res) => {
        const { username, role } = req.staff;
        const { staffUsername ,signIn, signOut } = req.body;
        try {
            if (role === "HR") {
                if ((typeof staffUsername !== 'string') || Number.isNaN(Date.parse(signIn)) || Number.isNaN(Date.parse(signOut))) {
                    return res.send("input is not valid");
                }
                const user = await Staff.findOne({ username: staffUsername });
                if (!user) {
                    return res.send("User does not exist");
                }
                const signInDate = new Date(signIn);
                const signOutDate = new Date(signOut);
                const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                const dayName = days[signInDate.getDay()];
                let sevenAM = new Date(signIn);
                sevenAM.setHours(7,0,0,0);
                let sevenPM = new Date(signIn);
                sevenPM.setHours(19,0,0,0);
                const durationBefore = moment(sevenAM).diff(moment(signInDate), 'minutes'); //before 7AM
                const durationAfter = moment(signOutDate).diff(moment(sevenPM), 'minutes'); //after 7PM
                let durationTotal = moment(signOutDate).diff(moment(signInDate), 'minutes');
                if (durationBefore > 0) {
                    durationTotal -= durationBefore; // neglecting before 7Am
                }
                if (durationAfter > 0) {
                    durationTotal -= durationAfter; // neglecting after 7PM
                }
                if (durationTotal > 0) {
                    if (dayName !== "Friday" && dayName !== user.dayOff) { // if not day-off
                        const missingMinutes = (504 > durationTotal) ? (504 - durationTotal) : 0;
                        const extraMinutes = (durationTotal > 504) ? (durationTotal - 504) : 0;
                        user.missingMinutes += missingMinutes;
                        user.extraMinutes += extraMinutes;
                    }
                    else { // if day-off
                        user.extraMinutes += durationTotal;
                    }
                    if (user.missingMinutes > 0 && user.extraMinutes > 0) {
                        if (user.missingMinutes >= user.extraMinutes) {
                            user.missingMinutes -= user.extraMinutes;
                            user.extraMinutes = 0;
                        }
                        else {
                            user.extraMinutes -= user.missingMinutes;
                            user.missingMinutes = 0;
                        }
                    }
                }
                user.attendance.push({
                    signIn: signInDate,
                    signOut: signOutDate
                });
                await Staff.updateOne({username: staffUsername}, {"$set": {attendance: user.attendance, missingMinutes: user.missingMinutes, extraMinutes: user.extraMinutes}});
                res.send("Record added successfully");
            }
            else {
                res.send("You are not authorized to do this functionality");
            }
        }
        catch (err) {
            res.send(err);
        }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { HOD Functionalities }

//DONE
app.post("/viewStaffInDepartment", verify, async (req, res) => { //view staff in the given department
    if (req.staff.role === "HOD") {
        const dep = await Staff.findOne({username: req.staff.username})
        const depName = dep.department
        if(req.body.department===depName){
            const staff = await Staff.find({department: req.body.department});
            res.send(staff);
        }else{
            res.send("Please Enter A department as the department You Are In")
        }
        
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

//DONE
app.get("/viewDayOffAllStaff",verify,async(req,res)=>{
    if(req.staff.role == "HOD"){
        const x = []
        const staff = await Staff.find({});
        const dep = await Staff.findOne({username: req.staff.username})
        // res.send(req.staff);
        staff.forEach(st => {
            if(st.department== dep.department){
                x.push({name: st.username, department: st.department, dayOff: st.dayOff})
            }
        });
        res.send(x)
    }else{
        res.send("You are not authorized to do this functionality")
    }
})

//DONE
app.post("/viewDayOffSingleStaff",verify,async(req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.username)) == 'string'){
        const x = []
        const staff = await Staff.find({});
        const dep = await Staff.findOne({username: req.staff.username});
        staff.forEach(st=>{
            if(st.department===dep.department && st.username == req.body.username){
                x.push({name: st.username, dayOff:st.dayOff})
            }
        })
        if(x.length==0){
            res.send("Couldn't find a staff member with the given username in department");
        }else{
            res.send(x);
        }
        
    }else{
        res.send("Please Enter a String in the username field")
    }
    }else {
        res.send("You are not authorized to do this functionality");
    }
    
})

//DONE
app.post("/assignCourseInstructor",verify,async (req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.instructor)) == 'string' && (typeof (req.body.courseName)) == 'string'){
            const acc = await Staff.findOne({username: req.staff.username});
            const dep = acc.department
            const hodFac = acc.faculty
            const fac = await Faculty.find({name: hodFac});
            const deps = []
            let found = false;
            let wantedCourse = [];
            const st = await Staff.findOne({username: req.body.instructor});
            if(st==null){
                res.send("could not find that instructor in the department")
            }
            if(st.department !=dep){
                res.send("The given name is not in the department")
            }
            fac[0].department.forEach(d=>{
                if(d.name == dep){
                    const cos = [];
                    d.course.forEach(c=>{
                        if(c.name==req.body.courseName){
                            found = true;
                            cos.push({name: c.name, instructor: req.body.instructor,coordinator:c.coordinator,slots:c.slots})
                            wantedCourse.push({name: c.name, instructor: req.body.instructor,coordinator:c.coordinator,slots:c.slots})
                        }else{
                            cos.push(c);
                        }
                    })
                    deps.push({name: d.name,head: d.head,course:cos})
                }else{
                    deps.push(d);
                }
            })
            if(!found){
                res.send("sorry this course is not in the department of that HOD")
            }

            await Staff.findOneAndUpdate({username: req.body.instructor}, {role: "CI"})
            
            const newF = {name: fac[0].name,department: deps};
            const newFac = new Faculty(newF);
            Faculty.findOneAndUpdate({name: hodFac},{department:deps},(error,data)=>{
                if(error){
                    console.log(error)
                }else{
                    console.log(data)
                }
            })
            res.send(wantedCourse);
            
        }else{
            res.send("Please Enter Strings in the courseName field and instructor field");
        }
        
    }else{
        res.send("You are not authorized to do this")
    }
})

//DONE
app.post("/updateCourseInstructor",verify,async (req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.instructor)) == 'string' && (typeof (req.body.courseName)) == 'string'){
            const acc = await Staff.findOne({username: req.staff.username});
            const dep = acc.department
            const hodFac = acc.faculty
            const fac = await Faculty.find({name: hodFac});
            const deps = []
            let found = false;
            let wantedCourse = [];
            const st = await Staff.findOne({username: req.body.instructor});
            if(st==null){
                res.send("could not find that instructor in the department")
            }
            if(st.department !=dep){
                res.send("The given name is not in the department")
            }
            fac[0].department.forEach(d=>{
                if(d.name == dep){
                    const cos = [];
                    d.course.forEach(c=>{
                        if(c.name==req.body.courseName){
                            found = true;
                            cos.push({name: c.name, instructor: req.body.instructor,coordinator:c.coordinator,slots:c.slots})
                            wantedCourse.push({name: c.name, instructor: req.body.instructor,coordinator:c.coordinator,slots:c.slots})
                        }else{
                            cos.push(c);
                        }
                    })
                    deps.push({name: d.name,head: d.head,course:cos})
                }else{
                    deps.push(d);
                }
            })
            if(!found){
                res.send("sorry this course is not in the department of that HOD")
            }

            await Staff.findOneAndUpdate({username: req.body.instructor}, {role: "CI"})
            
            const newF = {name: fac[0].name,department: deps};
            const newFac = new Faculty(newF);
            Faculty.findOneAndUpdate({name: hodFac},{department:deps},(error,data)=>{
                if(error){
                    console.log(error)
                }else{
                    console.log(data)
                }
            })
            res.send(wantedCourse);
            
        }else{
            res.send("Please Enter Strings in the courseName field and instructor field");
        }
        
    }else{
        res.send("You are not authorized to do this")
    }
})

//DONE
app.post("/deleteCourseInstructor",verify,async (req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.courseName)) == 'string'){
        const acc = await Staff.findOne({username: req.staff.username});
        const dep = acc.department
        const hodFac = acc.faculty
        const fac = await Faculty.find({name: hodFac});
        const deps = []        
        let found = false;
        let wantedCourse = [];
        let oldInstructor = "";
        fac[0].department.forEach(d=>{
            if(d.name == dep){
                const cos = [];
                d.course.forEach(c=>{
                    if(c.name==req.body.courseName){
                        found = true;
                        oldInstructor = c.instructor;
                        cos.push({name: c.name, instructor: "",coordinator:c.coordinator,slots:c.slots})
                        wantedCourse.push({name: c.name, instructor: "",coordinator:c.coordinator,slots:c.slots})
                    }else{
                        cos.push(c);
                    }
                })
                deps.push({name: d.name,head: d.head,course:cos})
            }else{
                deps.push(d);
            }
        })
        if(!found){
            res.send("sorry this course is not in the department of that HOD")
        }
        await Staff.findOneAndUpdate({username: oldInstructor}, {role: ""})
        const newF = {name: fac[0].name,department: deps};
        const newFac = new Faculty(newF);
        Faculty.findOneAndUpdate({name: hodFac},{department:deps},(error,data)=>{
            if(error){
                console.log(error)
            }else{
                console.log(data)
            }
        })
        res.send(wantedCourse);
    }else{
        res.send("please Enter a String in the courseName field")
    }
    }else{
        res.send("You are not authorized to do this")
    }
})


//DONE
app.get("/viewLeaveRequests",verify, async(req,res)=>{
    if(req.staff.role=="HOD"){
        // const acc = await Staff.findOne({username: req.staff.username});
        // const dep = acc.department
        // const hodFac = acc.faculty
        // const fac = await Faculty.find({name: hodFac});
        // const hodName = acc.username
        // const deps = fac[0].department
        // let hodDep = {}
        // deps.forEach((d)=>{if(d.name==dep){hodDep = d}});
        // let hodStaff = [];
        // hodDep.course.forEach((c)=>{
        //     hodStaff.push(c.coordinator);
        //     hodStaff.push(c.instructor);
        //     c.slots.forEach((slot)=>{
        //         hodStaff.push(slot.teacher);
        //     })
        // })

        
        
        // leaveRequests.forEach((leave)=>{
        //     hodStaff.forEach((hodS)=>{
        //         if(hodS==leave.sender && hodName == leave.recipient){
        //             leaveRequestsArray.push(leave);
        //         }
        //     })
        // })

        const leaveRequests = await LeaveRequest.find({recipient: req.staff.username});
        
        res.send(leaveRequests);
        

    }else{
        res.send("You are not authorized to view the requests")
    }
    
})

//DONE
app.get("/viewDayOffRequests",verify, async(req,res)=>{
    if(req.staff.role=="HOD"){
        // const acc = await Staff.findOne({username: req.staff.username});
        // const dep = acc.department
        // const hodFac = acc.faculty
        // const fac = await Faculty.find({name: hodFac});
        // const hodName = acc.username
        // const deps = fac[0].department
        // let hodDep = {}
        // deps.forEach((d)=>{if(d.name==dep){hodDep = d}});
        // let hodStaff = [];
        // hodDep.course.forEach((c)=>{
        //     hodStaff.push(c.coordinator);
        //     hodStaff.push(c.instructor);
        //     c.slots.forEach((slot)=>{
        //         hodStaff.push(slot.teacher);
        //     })
        // })

        // let dayOffRequestsArray = [];
        // const dayOffRequests = await DayOffRequest.find({});
        // dayOffRequests.forEach((day)=>{
        //     hodStaff.forEach((hodS)=>{
        //         if(hodS==day.sender && hodName==day.recipient){
        //             dayOffRequestsArray.push(day);
        //             // console.log(day);
        //         }
        //     })
        // })
        const dayOffRequests = await DayOffRequest.find({recipient: req.staff.username})
        res.send(dayOffRequests);
        

    }else{
        res.send("You are not authorized to view the requests")
    }
    
})

//DONE
app.get("/viewTeachingAssignments",verify,async(req,res)=>{
    if(req.staff.role=="HOD"){
        const acc = await Staff.findOne({username: req.staff.username});
        const dep = acc.department
        const hodFac = acc.faculty
        const fac = await Faculty.find({name: hodFac});
        const hodName = acc.username
        const deps = fac[0].department
        let hodDep = {}
        deps.forEach((d)=>{if(d.name==dep){hodDep = d}});

        let teachingAssignments = [];
        hodDep.course.forEach((c)=>{
            let x = [];
            c.slots.forEach((slot)=>{
                x.push(slot)
            })
            teachingAssignments.push({courseName: c.name, Assignments : x})
        })

        res.send(teachingAssignments);

    }else{
        res.send("You are not authorized to view teaching assginments")
    }
})

//DONE
app.get("/viewCoursesCoverage",verify,async(req,res)=>{
    if(req.staff.role=="HOD"){
        const acc = await Staff.findOne({username: req.staff.username});
        const dep = acc.department
        const hodFac = acc.faculty
        const fac = await Faculty.find({name: hodFac});
        const hodName = acc.username
        const deps = fac[0].department
        let hodDep = {}
        deps.forEach((d)=>{if(d.name==dep){hodDep = d}});
        let courseCoverage = [];
        hodDep.course.forEach((c)=>{
            let courseStaff = [];
            c.slots.forEach((slot)=>{
                const slotTeacher = slot.teacher;
                const add = true;
                courseStaff.forEach((st)=>{
                    if(st==slotTeacher){
                        add = false;
                    }
                })
                if(add){
                    courseStaff.push(slotTeacher);
                }
            })
            courseCoverage.push({courseName:c.name,coverage: (courseStaff.length)/(c.slots.length)})
        })

        res.send(courseCoverage);
    }else{
        res.send("You are not authorized to view the course coverage")
    }
})

//DONE
app.post("/rejectDayOffRequest",verify,async(req,res)=>{
    if(req.staff.role == "HOD"){
       
        if((typeof (req.body.id)) == 'string' && (typeof (req.body.rejectionReason)) == 'string'){
        await DayOffRequest.findByIdAndUpdate({_id:req.body.id},{"$set":{status:"R",rejectionReason:req.body.rejectionReason}},(error,data)=>{
                if(error){
                    console.log(error)
                }else{
                    console.log(data)
                    res.send(data);
                }
            })

        const request = await DayOffRequest.findById({_id:req.body.id});
        await Staff.findOneAndUpdate({username: request.sender},{$inc: {notifications:1}});
        const message = "Your Day Off request was accepted ";
        const newNotification = new Notification({
            user:request.sender,
            message: message,
            date: new Date()
        })
        await newNotification.save();
    }else{
        res.send("Please Enter a string in the id field and in the rejectionReason field")
    }
    }else{
        res.send("You are not authorized to reject day off requests")
    }
})
//DONE
app.post("/rejectLeaveRequest",verify,async(req,res)=>{
    if(req.staff.role == "HOD"){
        if((typeof (req.body.id)) == 'string' && (typeof (req.body.rejectionReason)) == 'string'){
        await LeaveRequest.findByIdAndUpdate({_id:req.body.id},{"$set":{status:"R",rejectionReason:req.body.rejectionReason}},(error,data)=>{
            if(error){
                console.log(error)
            }else{
                console.log(data)
            }
        })

        const request = await LeaveRequest.findById({_id:req.body.id});
        await Staff.findOneAndUpdate({username: request.sender},{$inc: {notifications:1}});
        const message = "Your Leave request was rejected ";
        const newNotification = new Notification({
            user:request.sender,
            message: message,
            date: new Date()
        })
        await newNotification.save();
    }else{
        res.send("please Enter a string in the id field and in the rejecitonReason field")
    }
    }else{
        res.send("You are not authorized to reject day off requests")
    }
})

//DONE
app.post("/acceptDayOffRequest",verify,async(req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.id)) == 'string' ){
        await DayOffRequest.findByIdAndUpdate({_id:req.body.id},{status:"A"},(error,data)=>{
            if(error){
                console.log(error)
            }else{
                console.log(data)
            }
        })
        const request = await DayOffRequest.findById({_id:req.body.id});
        const senderName = request.sender
        await Staff.findOneAndUpdate({username:senderName},{dayOff:request.day},(error,data)=>{
            if(error){
                console.log(error)
            }else{
                console.log(data)
                res.send(data);
            }
        })

        await Staff.findOneAndUpdate({username: request.sender},{$inc: {notifications:1}});
        const message = "Your Day Off request was accepted ";
        const newNotification = new Notification({
            user:request.sender,
            message: message,
            date: new Date()
        })
        await newNotification.save();
    }else{
        res.send("Please Enter a string in the id field")
    }

    }else{
        res.send("You are not authorized to accept day off requests")
    }
})

//DONE
app.post("/acceptLeaveRequest",verify,async(req,res)=>{
    if(req.staff.role=="HOD"){
        if((typeof (req.body.id)) == 'string'){
        const request = await LeaveRequest.findById({_id:req.body.id});
        const requestType = request.type;
        const sender = await Staff.findOne({username: request.sender});
        if(requestType=="Annual"){
            
            const monthDifference = moment().diff(moment(sender.annualLastAdded),'months');
            const balance = sender.annualBalance+(monthDifference*2.5)-1;
            const newDate = moment(sender.annualLastAdded).add(monthDifference,'months')
            const lastAdded = newDate.toDate();
            if(balance<0){
                return res.send("Sender does not have enough annual balance");
            }
            await Staff.updateOne({username: request.sender},{"$set":{annualBalance: balance,annualLastAdded: lastAdded}})
        }else if(requestType=="Accidental"){
            if(sender.accidentalDays === 0){
                return res.send("You have consumed all six days for accidental leaves");
            }
            const monthDifference = moment().diff(moment(sender.annualLastAdded),'months');
            const balance = sender.annualBalance+ (monthDifference*2.5)-1;
            const newDate = moment(sender.annualLastAdded).add(monthDifference,'months')
            const lastAdded = newDate.toDate();
            if(balance<0){
                return res.send("sender does not have enough annual balance");
            }
            const newAccidentalDays = sender.accidentalDays-1;
            await Staff.updateOne({username: request.sender},{"$set":{annualBalance: balance,annualLastAdded: lastAdded,accidentalDays: newAccidentalDays}});
        }

        await LeaveRequest.findByIdAndUpdate({_id:req.body.id},{status:"A"},(error,data)=>{
            if(error){
                console.log(error)
            }else{
                console.log(data)
                res.send(data);
            }
        })

        
        await Staff.findOneAndUpdate({username: request.sender},{$inc: {notifications:1}});
        const message = "Your Leave request was accepted ";
        const newNotification = new Notification({
            user:request.sender,
            message: message,
            date: new Date()
        })
        await newNotification.save();
    }else{
        res.send("Please Enter a string in the id field")
    }
    }else{
        res.send("You are not authorized to accept leave requests")
    }
    
})

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { Course instructor Functionalities }

app.post("/viewStaffInCourseProfile", verify, async (req, res) => { //view staff teaching the given course
    const { username, role } = req.staff;
    const { course } = req.body;
    if (role !== "HR") {
        if (typeof course !== 'string') {
            return res.send("course is not valid");
        }
        const staff = await Staff.find({courses: course});
        const staffEdited = [];
        staff.forEach(person => {
            if (person.username !== username) {
                staffEdited.push(person);
            }
        });
        res.send(staffEdited);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.get("/viewStaffInDepartmentProfile", verify, async (req, res) => { //view staff in the given department
    if (req.staff.role !== "HR") {
        const staff = await Staff.findOne({username: req.staff.username});
        const dep = staff.department;
        console.log(dep);
        const result = await Staff.find({department: dep});
        res.send(result);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

    app.post("/viewSlotsAssignment", verify, async (req, res) => {
        if(req.staff.role === "CI")
        {
            let instructorName = req.staff.username;
            let courseR = req.body.course;
            if(typeof courseR !== 'string' || courseR === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentR = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentR, "department.course.name" : courseR});
                let courses = record.department[0].course;
                courses.forEach((cours) => {
                    if(cours.name === courseR)
                    {
                        res.send(cours.slots);
                    }
                });
            }
        }
        else 
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.get("/viewCourses", verify, async (req, res) => {
        let instructorName = req.staff.username;
        if(req.staff.role !== "HR")
        {
            let record = await Staff.findOne({username : instructorName});
            res.send(record.courses);
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/viewCourseCoverage", verify, async (req, res) => {
        let instructorName = req.staff.username;
        if(req.staff.role === "CI")
        {
            let courseName = req.body.course;
            if(typeof courseName !== 'string' || courseName === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let coverage = -1;
                let instructorRecord = await Staff.findOne({username : instructorName});
                let department = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : department, "department.course.name" : courseName});
                let courses = record.department[0].course;
                courses.forEach((course) => {
                    if(course.name === courseName)
                    {
                        let courseSlots = course.slots;
                        let assignedSlots = 0;
                        courseSlots.forEach((slot) => {
                        if(slot.teacher !== undefined)
                        {
                            assignedSlots++;
                        }
                        });
                        coverage = ((assignedSlots / courseSlots.length) * 100);
                    }
                });
                res.send("Course coverage is: " + coverage + "%");
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/assignCoordinator", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let course = req.body.course;
        let coordinatorName = req.body.coordinatorName;
        if(req.staff.role === "CI")
        {
            if(typeof course !== 'string' || course === "" || typeof coordinatorName !== 'string' || coordinatorName === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentR = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentR,"department.course.name" : course});
                let newDep = JSON.parse(JSON.stringify(record.department));
                let newCourses = JSON.parse(JSON.stringify(newDep[0].course));
                newCourses.forEach((cours) => {
                    if(cours.name === course)
                    {
                        cours.coordinator = coordinatorName;
                    }
                });
                newDep[0].course = JSON.parse(JSON.stringify(newCourses));
                await Faculty.updateOne({"department.name" : departmentR,"department.course.name" : course}, {department : newDep});
                await Staff.updateOne({username : coordinatorName}, {role : "CC"});
                res.send("Coordinator has been successfully assigned.");
            } 
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/viewUnassignedSlots", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let course = req.body.course;
        if(req.staff.role === "CI")
        {
            if(typeof course !== 'string' || course === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentI = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentI, "department.course.name" : course});
                let result = [];
                let departmentRecord = record.department;
                let courseRecord = departmentRecord[0].course;
                courseRecord.forEach((cours) => {
                    if(cours.name === course)
                    {
                        let slotsRecord = cours.slots;
                        slotsRecord.forEach((slot) => {
                            if(slot.teacher === undefined)
                            {
                                result.push(slot);
                            }
                        });
                    }
                });
                res.send(result);
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/viewAssignedSlots", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let course = req.body.course;
        if(req.staff.role === "CI")
        {
            if(typeof course !== 'string' || course === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentI = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentI, "department.course.name" : course});
                let result = [];
                let departmentRecord = record.department;
                let courseRecord = departmentRecord[0].course;
                courseRecord.forEach((cours) => {
                    if(cours.name === course)
                    {
                        let slotsRecord = cours.slots;
                        slotsRecord.forEach((slot) => {
                            if(slot.teacher)
                            {
                                result.push(slot);
                            }
                        });
                    }
                });
                res.send(result);
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.get("/viewCourseSlots", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let courseName = req.body.course;
        if(req.staff.role !== "HR")
        {
            if(typeof courseName !== 'string' || courseName === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentName = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentName, "department.course.name" : courseName, 
                                                    "department.course.instructor" : instructorName});
                let courses = record.department[0].course;
                courses.forEach((cours) => {
                    if(cours.name === courseName)
                    {
                        res.send(cours.slots);
                    }
                });
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/assignAcademicMember", verify, async (req, res) => {
        if(req.staff.role === "CI")
        {
            let teacherName = req.body.teacher;
            let courseName = req.body.course;
            if(typeof teacherName !== 'string' || teacherName === "" || typeof courseName !== 'string' || courseName === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let teacherRecord = await Staff.findOne({username : teacherName});
                if(!teacherRecord)
                {
                    res.send("Please enter the correct username.");
                }
                else
                {
                    let newCourses = teacherRecord.courses;
                newCourses.push(courseName);
                await Staff.updateOne({username : teacherName}, {courses : newCourses});
                res.send("Academic member has been successfully added to your course.");
                }
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/assignToSlot", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let courseS = req.body.course;
        let assignedTeacher = req.body.teacher;
        let locationS = req.body.location;
        let dayS = req.body.day;
        let startS = req.body.start;
        let endS = req.body.end;
    
        if(req.staff.role === "CI")
        {
            if(typeof courseS !== 'string' || courseS === "" || typeof assignedTeacher !== 'string' || assignedTeacher === ""
            || typeof locationS !== 'string' || locationS === ""
            || typeof dayS !== 'string' || dayS === "" 
            || typeof startS !== 'string' || startS === "" || typeof endS !== 'string' || endS === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let teacherRecord = await Staff.findOne({username : assignedTeacher});
                let teacherSchedule = teacherRecord.schedule;
                let teacherAvailable = true;
                teacherSchedule.forEach((sched) => {
                    if(sched.day === dayS)
                    {
                        let scheduleSlots = sched.slots;
                        scheduleSlots.forEach((slot) => {
                            if(slot.start === startS)
                            {
                                teacherAvailable = false;
                            }
                        });
                    }
                });
                if(teacherAvailable)
                {
                    let instructorRecord = await Staff.findOne({username : instructorName});
                    let departmentS = instructorRecord.department;
                    let record = await Faculty.findOne({"department.name" : departmentS,"department.course.name" : courseS});
                    let newDep = record.department;
                    let newCourses = newDep[0].course;
                    newCourses.forEach((cours, index) => {
                        if(cours.name === courseS)
                        {
                            let newSlots = cours.slots;
                            newSlots.forEach((slot) => {
                                if((slot.location === locationS) && (slot.day === dayS) && (slot.start === startS) && (slot.end === endS))
                                {
                                    slot.teacher = assignedTeacher;
    
                                }
                            });
                            let newSched = teacherRecord.schedule;
                            newSched.forEach( async (sched, index) => {
                                if(sched.day === dayS)
                                {
                                    let newSchedSlots = sched.slots;
                                    newSchedSlots.push({course : courseS, location : locationS, start : startS, end : endS});
                                    let newDay = {day : dayS, slots : newSchedSlots};
                                    newSched[index] = newDay;
                                    await Staff.updateOne({username : assignedTeacher}, {schedule : newSched});
                                }
                            })
                            newCourses[index].slots = newSlots;
                        }
                    });
                    newDep[0].course = newCourses;
                    await Faculty.updateOne({"department.name" : departmentS,"department.course.name" : courseS}, {department : newDep});
                    
                    res.send("Slot has been successfully assigned.");
                }
                else
                {
                    res.send("The chosen teacher is not available for this slot.");
                }
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/removeSlotAssignment", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let courseS = req.body.course;
        let assignedTeacher = req.body.teacher;
        let locationS = req.body.location;
        let dayS = req.body.day;
        let startS = req.body.start;
        let endS = req.body.end;
        let result = [];
        if(req.staff.role === "CI")
        {
            if(typeof courseS !== 'string' || courseS === "" || typeof assignedTeacher !== 'string' || assignedTeacher === ""
            || typeof locationS !== 'string' || locationS === ""
            || typeof dayS !== 'string' || dayS === ""
            || typeof startS !== 'string' || startS === "" || typeof endS !== 'string' || endS === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                let instructorRecord = await Staff.findOne({username : instructorName});
                let departmentS = instructorRecord.department;
                let record = await Faculty.findOne({"department.name" : departmentS,"department.course.name" : courseS});
                let newDep = JSON.parse(JSON.stringify(record.department));
                let newCourses = JSON.parse(JSON.stringify(newDep[0].course));
                newCourses.forEach((cours, index) => {
                    if(cours.name === courseS)
                    {
                        let newSlots = JSON.parse(JSON.stringify(cours.slots));
                        newSlots.forEach((slot) => {
                        if(!((slot.location === locationS) &&
                                (slot.day === dayS) && (slot.start === startS) && (slot.end === endS)))
                                {
                                    result.push(slot);
                                }
                                else
                                {
                                    slot.teacher = undefined;
                                    result.push(slot);
                                }
                        });
                        newCourses[index].slots = JSON.parse(JSON.stringify(result));
                    }
                });
                newDep[0].course = JSON.parse(JSON.stringify(newCourses));
                await Faculty.updateOne({"department.name" : departmentS,"department.course.name" : courseS}, {department : newDep});
                let teacherRecord = await Staff.findOne({username : assignedTeacher});
                let newSched = teacherRecord.schedule;
                newSched.forEach((sched, index) => {
                    if(sched.day === dayS)
                    {
                        let newDaySlots = sched.slots;
                        let resultT = [];
                        newDaySlots.forEach((dayslot) => {
                            if(!((dayslot.location === locationS) &&
                            (dayslot.course === courseS) && (dayslot.start === startS) && (dayslot.end === endS)))
                            {
                                resultT.push(dayslot);
                            }
                        });
                        newSched[index].slots = resultT;
                    }
                });
                await Staff.updateOne({username : assignedTeacher}, {schedule : newSched});
                res.send("Slot assignment has been sccessfully removed.");
            }
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });
    
    app.post("/updateSlotAssignment", verify, async (req, res) => {
        let instructorName = req.staff.username;
        let courseS = req.body.course;
        let oldTeacher = req.body.oldteacher;
        let newTeacher = req.body.newteacher;
        let locationS = req.body.location;
        let dayS = req.body.day;
        let startS = req.body.start;
        let endS = req.body.end;
        
    
        if(req.staff.role === "CI")
        {
            if(typeof courseS !== 'string' || courseS === "" || typeof oldTeacher !== 'string' || oldTeacher === "" 
            || typeof newTeacher !== 'string' || newTeacher === "" || typeof locationS !== 'string' || locationS === ""
            || typeof dayS !== 'string' || dayS === "" || typeof startS !== 'string' || startS === "" 
            || typeof endS !== 'string' || endS === "")
            {
                res.send("Please enter the correct data.");
            }
            else
            {
                if(oldTeacher === newTeacher)
                {
                    res.send("The teacher you have chosen already teaches this slot.");
                }
                else
                {
                    let instructorRecord = await Staff.findOne({username : instructorName});
                    let oldTeacherRecord = await Staff.findOne({username : oldTeacher});
                    let newTeacherRecord = await Staff.findOne({username : newTeacher});
                    
                    let teacherSchedule = newTeacherRecord.schedule;
                    let teacherAvailable = true;
                    teacherSchedule.forEach((sched) => {
                        if(sched.day === dayS)
                        {
                            let scheduleSlots = sched.slots;
                            scheduleSlots.forEach((slot) => {
                                if(slot.start === startS)
                                {
                                    teacherAvailable = false;
                                }
                            });
                        }
                    });
    
                    if(teacherAvailable)
                    {
                        let department = instructorRecord.department;
                        let record = await Faculty.findOne({"department.name" : department, "department.course.name" : courseS});
                        let newDep = record.department;
                        let newCourses = newDep[0].course;
                        newCourses.forEach((cours, index) => {
                            if(cours.name === courseS)
                            {
                                let newSlots = cours.slots;
                                let resultI = [];
                                newSlots.forEach((slot) => {
                                    if(!((slot.location === locationS) &&
                                    (slot.day === dayS) && (slot.start === startS) && (slot.end === endS)))
                                    {
                                        resultI.push(slot);
                                    }
                                    else{
                                        if(slot.teacher === newTeacher)
                                        {
                                            res.send("The teacher you have chosen already teaches this slot.");
                                        }
                                        else
                                        {
                                            slot.teacher = newTeacher;
                                            resultI.push(slot);
                                        }
                                        
                                    }
                                });
                                newCourses[index].slots = resultI;
                            }
                        });
                        newDep[0].course = newCourses;
                        await Faculty.updateOne({"department.name" : department,"department.course.name" : courseS}, {department : newDep});
    
                        let oldTeacherSched = oldTeacherRecord.schedule;
                        oldTeacherSched.forEach((sched, index) => {
                            if(sched.day === dayS)
                            {
                                let newDaySlotsOld = sched.slots;
                                let resultO = [];
                                newDaySlotsOld.forEach((dayslot) => {
                                    if(!((dayslot.location === locationS) &&
                                    (dayslot.course === courseS) && (dayslot.start === startS) && (dayslot.end === endS)))
                                    {
                                        resultO.push(dayslot);
                                    }
                                });
                                oldTeacherSched[index].slots = resultO;
                            }
                        });
                        await Staff.updateOne({username : oldTeacher}, {schedule : oldTeacherSched});
    
                        let newTeacherSched = newTeacherRecord.schedule;
                        newTeacherSched.forEach((sched, index) => {
                            if(sched.day === dayS)
                            {
                                let newDaySlotsNew = sched.slots;
                                newDaySlotsNew.push({course : courseS, location : locationS, start : startS, end : endS});
                                oldTeacherSched[index].slots = newDaySlotsNew;
                            }
                        });
                        await Staff.updateOne({username : newTeacher}, {schedule : newTeacherSched});
                        res.send("Slot has been successfully updated.");
                    }
                    else
                    {
                        res.send("New teacher unavailable for this slot.");
                    }
                }
            }
                
        }
        else
        {
            res.send("You are not authorized to do this functionality");
        }
    });

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { Course coordinator Functionalities }

app.get("/viewSlotLinkingRequests", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "CC") {
        const requests = await SlotLinkingRequest.find({ recipient: username });
        res.send(requests);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.post("/rejectSlotLinking", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role === "CC") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const rejectedRequest = await SlotLinkingRequest.findByIdAndUpdate(requestId, {status: "R"});
        if (!rejectedRequest) {
            return res.send("request is not found");
        }
        await Staff.updateOne({username: rejectedRequest.sender}, {$inc: {notifications: 1}});
        const message = username + " rejected your slot linking request for {course: " + rejectedRequest.course + ", day: " + rejectedRequest.day + ", start: " + rejectedRequest.start + ", end: " + rejectedRequest.end + ", location: " + rejectedRequest.location + "}"; 
        const newNotification = new Notification({
            user: rejectedRequest.sender,
            message: message,
            date: new Date()
        });
        await newNotification.save();
        rejectedRequest.status = "R";
        res.send(rejectedRequest);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/acceptSlotLinking", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role === "CC") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await SlotLinkingRequest.findById(requestId);
        if (!request) {
            return res.send("request is not found");
        }
        const sender = await Staff.findOne({username: request.sender});
        let inserted = false;
        const slot = {
            course: request.course,
            location: request.location,
            start: request.start,
            end: request.end
        };
        for (let i=0; i<sender.schedule.length; i++) {
            if (sender.schedule[i].day === request.day) {
                for (let j=0; j<sender.schedule[i].slots.length; j++) {
                    if (sender.schedule[i].slots[j].start === slot.start) {
                        return res.send("Sender already has teaching duty at that time");
                    }
                }
                sender.schedule[i].slots.push(slot);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            sender.schedule.push({
                day: request.day,
                slots: [slot]
            });
        }              
        const faculty = await Faculty.findOne({"department.name": sender.department});
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].name === request.course) {
                        if (faculty.department[i].course[j].coordinator !== username) {
                            return res.send("You are not the coordinator of this course");
                        }
                        for (let k=0; k<faculty.department[i].course[j].slots.length; k++) {
                            if (faculty.department[i].course[j].slots[k].day === request.day && faculty.department[i].course[j].slots[k].start === request.start && faculty.department[i].course[j].slots[k].location === request.location) {
                                if (faculty.department[i].course[j].slots[k].teacher) {
                                    return res.send("This slot is already assigned to a staff");
                                }
                                faculty.department[i].course[j].slots[k].teacher = sender.username;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (!sender.courses.includes(request.course)) {
            sender.courses.push(request.course);
        } 
        await Staff.updateOne({username: request.sender}, {"$set": {schedule: sender.schedule, courses: sender.courses}});
        await SlotLinkingRequest.updateOne({_id: requestId}, {status: "A"});
        await Faculty.updateOne({"department.name": sender.department}, {department: faculty.department});
        await Staff.updateOne({username: request.sender}, {$inc: {notifications: 1}});
        const message = username + " accepted your slot linking request for {course: " + request.course + ", day: " + request.day + ", start: " + request.start + ", end: " + request.end + ", location: " + request.location + "}"; 
        const newNotification = new Notification({
            user: request.sender,
            message: message,
            date: new Date()
        });
        await newNotification.save();
        request.status = "A";
        res.send(request);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// gets courses where the user is its coordinator
app.get("/viewCoursesOfCoordinator", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role === "CC") {
        const user = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": user.department});
        let courses = [];
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].coordinator === username) {
                        courses.push(faculty.department[i].course[j].name);
                    }
                }
                break;
            }
        }
        res.send(courses);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/addCourseSlot", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { courseName, day, start, end, location } = req.body;
    if (role === "CC") {
        if ((typeof courseName !== 'string') || (typeof day !== 'string') || (typeof start !== 'string') || (typeof end !== 'string') || (typeof location !== 'string')) {
            return res.send("input is not valid");
        }
        const user = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": user.department});
        const slot = {
            day: day,
            start: start,
            end: end,
            location: location
        };
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].name === courseName) {
                        if (faculty.department[i].course[j].coordinator !== username) {
                            return res.send("You are not the coordinator of this course");
                        }
                        faculty.department[i].course[j].slots.push(slot);
                        break;
                    }
                }
            }
        }
        await Faculty.updateOne({"department.name": user.department}, {department: faculty.department});
        res.send("Slot added successfully");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/updateCourseSlot", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { courseName, oldLocation, oldSlotDay, oldSlotStart, newTeacher, newLocation, newSlotDay, newSlotStart ,newSlotEnd } = req.body;
    if (role === "CC") {
        if ((typeof courseName !== 'string') || (typeof oldLocation !== 'string') || (typeof oldSlotDay !== 'string') || (typeof oldSlotStart !== 'string') || (typeof newTeacher !== 'string') || (typeof newLocation !== 'string') || (typeof newSlotDay !== 'string') || (typeof newSlotStart !== 'string') || (typeof newSlotEnd !== 'string')) {
            return res.send("input is not valid");
        }
        const user = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": user.department});
        let oldTeacher;
        let location;
        let day;
        let start;
        let end;
        let found = false;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].name === courseName) {
                        if (faculty.department[i].course[j].coordinator !== username) {
                            return res.send("You are not the coordinator of this course");
                        }
                        for (let k=0; k<faculty.department[i].course[j].slots.length; k++) {
                            if ((faculty.department[i].course[j].slots[k].location === oldLocation) && (faculty.department[i].course[j].slots[k].day === oldSlotDay) && (faculty.department[i].course[j].slots[k].start === oldSlotStart)) {
                                oldTeacher = faculty.department[i].course[j].slots[k].teacher;
                                faculty.department[i].course[j].slots[k].teacher = newTeacher ? newTeacher : faculty.department[i].course[j].slots[k].teacher;
                                faculty.department[i].course[j].slots[k].location = newLocation ? newLocation : faculty.department[i].course[j].slots[k].location;
                                faculty.department[i].course[j].slots[k].day = newSlotDay ? newSlotDay : faculty.department[i].course[j].slots[k].day;
                                faculty.department[i].course[j].slots[k].start = newSlotStart ? newSlotStart : faculty.department[i].course[j].slots[k].start;
                                faculty.department[i].course[j].slots[k].end = newSlotEnd ? newSlotEnd : faculty.department[i].course[j].slots[k].end;
                                location = faculty.department[i].course[j].slots[k].location;
                                day = faculty.department[i].course[j].slots[k].day;
                                start = faculty.department[i].course[j].slots[k].start;
                                end = faculty.department[i].course[j].slots[k].end;
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (!found) {
            return res.send("There is no slot with the specified input");
        }
        if (oldTeacher && !newTeacher) {
            const old = await Staff.findOne({username: oldTeacher});
            for (let i=0; i<old.schedule.length; i++) {
                if (old.schedule[i].day === oldSlotDay) {
                    const newSlots = old.schedule[i].slots.filter(slot => {
                        return slot.start !== oldSlotStart;
                    });
                    old.schedule[i].slots = newSlots;
                    break;
                }
            }
            let inserted = false;
            const newSlot = {
                course: courseName,
                location: location,
                start: start,
                end: end
            };
            for (let i=0; i<old.schedule.length; i++) {
                if (old.schedule[i].day === day) {
                    old.schedule[i].slots.push(newSlot);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                old.schedule.push({
                    day: day,
                    slots: [newSlot]
                });
            }       
            await Staff.updateOne({username: oldTeacher}, {schedule: old.schedule});
        }
        if (newTeacher) {
            const newT = await Staff.findOne({username: newTeacher});
            if (!newT) {
                return res.send("There is no teacher with the given username");
            }
            let inserted = false;
            const newSlot = {
                course: courseName,
                location: location,
                start: start,
                end: end
            };
            for (let i=0; i<newT.schedule.length; i++) {
                if (newT.schedule[i].day === day) {
                    for (let j=0; j<newT.schedule[i].slots.length; j++) {
                        if (newT.schedule[i].slots[j].start === start) {
                            return res.send("New teacher already has teaching duty at that time");
                        }
                    }
                    newT.schedule[i].slots.push(newSlot);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                newT.schedule.push({
                    day: day,
                    slots: [newSlot]
                });
            }
            await Staff.updateOne({username: newTeacher}, {schedule: newT.schedule});
            if (oldTeacher) {
                const old = await Staff.findOne({username: oldTeacher});
                for (let i=0; i<old.schedule.length; i++) {
                    if (old.schedule[i].day === oldSlotDay) {
                        const newSlots = old.schedule[i].slots.filter(slot => {
                            return slot.start !== oldSlotStart;
                        });
                        old.schedule[i].slots = newSlots;
                        break;
                    }
                }
                await Staff.updateOne({username: oldTeacher}, {schedule: old.schedule});   
            }

        }
        await Faculty.updateOne({"department.name": user.department}, {department: faculty.department});
        res.send("Slot updated successfully");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/deleteCourseSlot", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { courseName, location, slotDay, slotStart } = req.body;
    if (role === "CC") {
        if ((typeof courseName !== 'string') || (typeof location !== 'string') || (typeof slotDay !== 'string') || (typeof slotStart !== 'string')) {
            return res.send("input is not valid");
        }
        const user = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": user.department});
        let teacher;
        let found = false;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].name === courseName) {
                        if (faculty.department[i].course[j].coordinator !== username) {
                            return res.send("You are not the coordinator of this course");
                        }
                        const newSlots = faculty.department[i].course[j].slots.filter(slot => {
                            if ((slot.location === location) && (slot.day === slotDay) && (slot.start === slotStart)) {
                                teacher = slot.teacher;
                                found = true;
                                return false;
                            }
                            else {
                                return true;
                            }
                        });
                        faculty.department[i].course[j].slots = newSlots;
                        break;
                    }
                }
            }
        }
        if (!found) {
            return res.send("There is no slot with the specified input");
        }
        if (teacher) {
            const old = await Staff.findOne({username: teacher});
                for (let i=0; i<old.schedule.length; i++) {
                    if (old.schedule[i].day === slotDay) {
                        const newSlots = old.schedule[i].slots.filter(slot => {
                            return slot.start !== slotStart;
                        });
                        old.schedule[i].slots = newSlots;
                        break;
                    }
                }
            await Staff.updateOne({username: teacher}, {schedule: old.schedule});
        }
        await Faculty.updateOne({"department.name": user.department}, {department: faculty.department});
        res.send("Slot deleted successfully");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// { Academic member Functionalities }

// also removes replacements before today
app.get("/viewSchedule", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        const staff = await Staff.findOne({username: username});
        staff.schedule.forEach(day => {
            const newSlots = day.slots.filter(slot => {
                if (slot.replacement) {
                    return moment().isBefore(moment(slot.replacement).add(1, 'days'));
                }
                else {
                    return true;
                }
            });
            day.slots = newSlots;
        });
        await Staff.updateOne({username: username}, { schedule: staff.schedule });
        res.send(staff.schedule);   
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// also validates date given
app.post("/viewSlotsOnDate", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        if (Number.isNaN(Date.parse(req.body.date))) {
            return res.send("date is not valid");
        }
        let date = new Date(req.body.date);
        date.setHours(0,0,0,0);
        if (moment(date).isSame(moment(), 'day')) {
            return res.send("Date can not be today");
        }
        if (moment(date).isBefore(moment())) {
            return res.send("Date must not be before today");
        }
        const dayName = days[date.getDay()];
        const staff = await Staff.findOne({username: username});
        const slots = [];
        staff.schedule.forEach(element => {
            if (element.day === dayName) {
                element.slots.forEach(slot => {
                    if (slot.replacement) {
                        if (moment(date).isSame(moment(slot.replacement), 'day')) {
                            slots.push(slot);
                        }
                    }
                    else {
                        slots.push(slot);
                    }
                });
            }
        });
        res.send(slots);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

// from above slots we choose a slot and pass course name here
app.post("/viewStaffInCourse", verify, async (req, res) => { //view staff teaching the given course
    const { username, role } = req.staff;
    const { course } = req.body;
    if (role !== "HR") {
        if (typeof course !== 'string') {
            return res.send("course is not valid");
        }
        const staff = await Staff.find({courses: course});
        const staffEdited = [];
        staff.forEach(person => {
            if (person.username !== username) {
                staffEdited.push(person.username);
            }
        });
        res.send(staffEdited);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

// provided a date, a slot and a staff. Now we can send a replacement request 
app.post("/sendReplacement", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { senderDate, course, start, end, location, recipient } = req.body;
    if (role !== "HR") {
        if ((Number.isNaN(Date.parse(senderDate))) || (typeof course !== 'string') || (typeof start !== 'string') || (typeof end !== 'string') || (typeof location !== 'string') || (typeof recipient !== 'string')) {
            return res.send("input is not valid");
        }
        let date = new Date(senderDate);
        date.setHours(0,0,0,0);
        const senderSlot = {
            course: course,
            start: start,
            end: end,
            location: location,
            replacement: date
        };
        const newRequest = new ReplaceRequest({
            sender: username,
            recipient: recipient,
            status: "P",
            slot: senderSlot
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// choose from drop-down list the type of request
app.post("/viewSentRequests", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { type, status } = req.body;
    if (role !== "HR") {
        if ((typeof type !== 'string') || (typeof status !== 'string')) {
            return res.send("input is not valid");
        }
        let requests = [];
        if (type === "replacement") {
            if (!status) {
                requests = await ReplaceRequest.find({ sender: username });
            }
            else {
                requests = await ReplaceRequest.find({ sender: username, status: status });
            }
        }
        else if (type === "slotLinking") {
            if (!status) {
                requests = await SlotLinkingRequest.find({ sender: username });
            }
            else {
                requests = await SlotLinkingRequest.find({ sender: username, status: status });
            }
        }
        else if (type === "dayoff") {
            if (!status) {
                requests = await DayOffRequest.find({ sender: username });
            }
            else {
                requests = await DayOffRequest.find({ sender: username, status: status });
            }
        }
        else {
            if (!status) {
                requests = await LeaveRequest.find({ sender: username });
            }
            else {
                requests = await LeaveRequest.find({ sender: username, status: status, type: type });
            }
        }
        res.send(requests);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.get("/viewReceivedReplacement", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        const requests = await ReplaceRequest.find({ recipient: username });
        res.send(requests);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

// from viewed requests we can reject or accept
app.post("/rejectReplacement", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await ReplaceRequest.findById(requestId);
        if (!request) {
            return res.send("request is not found");
        }
        if (request.status === "R") {
            return res.send("You have already rejected this request before");
        }
        if (request.status === "A") {
            return res.send("Can not reject a request after accepting it");
        }
        await Staff.updateOne({username: request.sender}, {$inc: {notifications: 1}});
        const message = username + " rejected your replacement request for date " + moment(request.slot.replacement).format("YYYY/MM/DD") + " at " + request.slot.start; 
        const newNotification = new Notification({
            user: request.sender,
            message: message,
            date: new Date()
        });
        await newNotification.save();
        await ReplaceRequest.updateOne({_id: requestId}, {status: "R"});
        res.send("Request rejected successfully");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/acceptReplacement", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await ReplaceRequest.findById(requestId);
        if (!request) {
            return res.send("request is not found");
        }
        if (request.status === "A") {
            return res.send("You have already accepted this request before");
        }
        if (request.status === "R") {
            return res.send("Can not accept a request after rejecting it");
        }
        const recipient = await Staff.findOne({username: username});
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const date = moment(request.slot.replacement);
        const dayName = days[date.toDate().getDay()];
        let conflict = false;
        for (let i=0; i<recipient.schedule.length; i++) {
            if (recipient.schedule[i].day === dayName) {
                for (let j=0; j<recipient.schedule[i].slots.length; j++) {
                    if (recipient.schedule[i].slots[j].start === request.slot.start) {
                        if (recipient.schedule[i].slots[j].replacement) {
                            if (date.isSame(moment(recipient.schedule[i].slots[j].replacement), 'day')) {
                                conflict = true;
                                break;
                            }
                        }
                        else {
                            conflict = true;
                            break;
                        }
                    }
                }
            }
        }
        if (conflict) {
            return res.send("You already have a teaching activity at this slot");
        }
        let inserted = false;
        for (let i=0; i<recipient.schedule.length; i++) {
            if (recipient.schedule[i].day === dayName) {
                recipient.schedule[i].slots.push(request.slot);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            recipient.schedule.push({
                day: dayName,
                slots: [request.slot]
            });
        }              
        await Staff.updateOne({username: username}, {schedule: recipient.schedule});
        await Staff.updateOne({username: request.sender}, {$inc: {notifications: 1}});
        const message = username + " accepted your replacement request for date " + moment(request.slot.replacement).format("YYYY/MM/DD") + " at " + request.slot.start; 
        const newNotification = new Notification({
            user: request.sender,
            message: message,
            date: new Date()
        });
        await newNotification.save();
        await ReplaceRequest.updateOne({_id: requestId}, {status: "A"});
        res.send("Request accepted successfully");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get("/viewCoursesInDepartment", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        const user = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": user.department});
        let courses = [];
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                courses = faculty.department[i].course;
                break;
            }
        }
        res.send(courses);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

// from courses above we choose a course from drop-down and a slot from drop-down of that course
app.post("/sendSlotLinking", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { course, day, start, end, location } = req.body;
    if (role !== "HR") {
        if ((typeof course !== 'string') || (typeof day !== 'string') || (typeof start !== 'string') || (typeof end !== 'string') || (typeof location !== 'string')) {
            return res.send("input is not valid");
        }
        const user = await Staff.findOne({username: username});
        if (day === user.dayOff) {
            return res.send("Can not request a slot in your day off");
        }
        for (let i=0; i<user.schedule.length; i++) {
            if (user.schedule[i].name === day) {
                for (let j=0; j<user.schedule[i].slots.length; j++) {
                    if (!user.schedule[i].slots[j].replacement && user.schedule[i].slots[j].start === start) {
                        return res.send("You already have teaching duty at that time");
                    }
                }
                break;
            }
        }
        let coordinator = "";
        const faculty = await Faculty.findOne({"department.name": user.department});
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === user.department) {
                for (let j=0; j<faculty.department[i].course.length; j++) {
                    if (faculty.department[i].course[j].name === course) {
                        coordinator = faculty.department[i].course[j].coordinator;
                        break;
                    }
                }
                break;
            }
        }
        const newRequest = new SlotLinkingRequest({
            sender: username,
            recipient: coordinator,
            course: course,
            day: day,
            start: start,
            end: end,
            location: location,
            status: "P"
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.post("/sendChangeDayOff", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { day, reason } = req.body;
    if (role !== "HR") {
        if ((typeof day !== 'string') || (typeof reason !== 'string')) {
            return res.send("input is not valid");
        }
        const sender = await Staff.findOne({username: username});;
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        const newRequest = new DayOffRequest({
            sender: username,
            recipient: hod,
            day: day,
            reason: reason,
            status: "P"
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.post("/sendAnnualRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { date, reason, replacers } = req.body;
    if (role !== "HR") {
        if (Number.isNaN(Date.parse(date)) || (typeof reason !== 'string') || (!Array.isArray(replacers))) {
            return res.send("input is not valid");
        }
        for (let i=0; i<replacers.length; i++) {
            if (typeof (replacers[i]) !== 'string') {
                return res.send("input is not valid");
            }
        }
        let leaveDate = new Date(date);
        leaveDate.setHours(0,0,0,0);
        if (moment().isAfter(moment(leaveDate))) {
            return res.send("Can only submit an annual request before the targeted day");
        }
        const sender = await Staff.findOne({username: username});
        const monthDifference = moment().diff(moment(sender.annualLastAdded), 'months');
        const balance = sender.annualBalance + (monthDifference * 2.5);
        const newDate = moment(sender.annualLastAdded).add(monthDifference, 'months');
        const lastAdded = newDate.toDate();
        if ((balance-1) < 0) {
            return res.send("You do not have enough annual balance");
        }
        await Staff.updateOne({username: username}, {"$set": {annualBalance: balance, annualLastAdded: lastAdded}});
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        const newRequest = new LeaveRequest({
            type: "annual",
            sender: username,
            recipient: hod,
            date: leaveDate,
            reason: reason,
            status: "P",
            replacers: replacers
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/sendAccidentalRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { date, reason } = req.body;
    if (role !== "HR") {
        if (Number.isNaN(Date.parse(date)) || (typeof reason !== 'string')) {
            return res.send("input is not valid");
        }
        const sender = await Staff.findOne({username: username});
        if (sender.accidentalDays === 0) {
            return res.send("You have consumed all six days for accidental leaves");
        }
        const monthDifference = moment().diff(moment(sender.annualLastAdded), 'months');
        const balance = sender.annualBalance + (monthDifference * 2.5);
        const newDate = moment(sender.annualLastAdded).add(monthDifference, 'months');
        const lastAdded = newDate.toDate();
        if ((balance-1) < 0) {
            return res.send("You do not have enough annual balance");
        }
        await Staff.updateOne({username: username}, {"$set": {annualBalance: balance, annualLastAdded: lastAdded}});
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        let leaveDate =new Date(date);
        leaveDate.setHours(0,0,0,0);
        const newRequest = new LeaveRequest({
            type: "accidental",
            sender: username,
            recipient: hod,
            date: leaveDate,
            reason: reason,
            status: "P"
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/sendSickRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { date, reason, documents } = req.body;
    if (role !== "HR") {
        if (Number.isNaN(Date.parse(date)) || (typeof reason !== 'string') || (!Array.isArray(documents))) {
            return res.send("input is not valid");
        }
        for (let i=0; i<documents.length; i++) {
            if (typeof (documents[i]) !== 'string') {
                return res.send("input is not valid");
            }
        }
        if (!documents || documents.length == 0) {
            return res.send("You have to provide proper documents");
        }
        let leaveDate = new Date(date);
        leaveDate.setHours(0,0,0,0);
        if (!moment().isBetween(moment(leaveDate), moment(leaveDate).add(4, 'days'))) {
            return res.send("Can only submit a sick request by maximum three days after the sick day");
        }
        const sender = await Staff.findOne({username: username});
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        const newRequest = new LeaveRequest({
            type: "sick",
            sender: username,
            recipient: hod,
            date: leaveDate,
            reason: reason,
            status: "P",
            documents: documents
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/sendMaternityRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { date, reason, documents } = req.body;
    if (role !== "HR") {
        if (Number.isNaN(Date.parse(date)) || (typeof reason !== 'string') || (!Array.isArray(documents))) {
            return res.send("input is not valid");
        }
        for (let i=0; i<documents.length; i++) {
            if (typeof (documents[i]) !== 'string') {
                return res.send("input is not valid");
            }
        }
        const sender = await Staff.findOne({username: username});
        if (sender.profile.gender !== "female") {
            return res.send("Only female staff can submit maternity leave requests");
        }
        if (!documents || documents.length == 0) {
            return res.send("You have to provide proper documents");
        }
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        let leaveDate = new Date(date);
        leaveDate.setHours(0,0,0,0);
        const newRequest = new LeaveRequest({
            type: "maternity",
            sender: username,
            recipient: hod,
            date: leaveDate,
            reason: reason,
            status: "P",
            documents: documents
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/sendCompensationRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { absentDate, compensationDate, reason } = req.body;
    if (role !== "HR") {
        if (Number.isNaN(Date.parse(absentDate)) || Number.isNaN(Date.parse(compensationDate)) || (typeof reason !== 'string')) {
            return res.send("input is not valid");
        }
        if (!reason) {
            return res.send("You have to provide a reason");
        }
        let leaveDate = new Date(absentDate);
        let compDate = new Date(compensationDate);
        leaveDate.setHours(0,0,0,0);
        compDate.setHours(0,0,0,0);
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const dayName = days[compDate.getDay()];
        const sender = await Staff.findOne({username: username});
        const dayOffTrue = (dayName === sender.dayOff) || (dayName === "Friday");
        if (!dayOffTrue || !moment(compDate).isSame(moment(leaveDate), 'month')) {
            return res.send("You have to attend your day off during the same month which you were absent in");
        }
        const faculty = await Faculty.findOne({"department.name": sender.department});
        let hod;
        for (let i=0; i<faculty.department.length; i++) {
            if (faculty.department[i].name === sender.department) {
                hod = faculty.department[i].head;
                break;
            }
        }
        const newRequest = new LeaveRequest({
            type: "compensation",
            sender: username,
            recipient: hod,
            date: leaveDate,
            compensationDate: compDate,
            reason: reason,
            status: "P"
        });
        await newRequest.save()
        .then(() => { res.send(newRequest) })
        .catch((err) => { res.send(err) });
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get("/getNotificationCount", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        const user = await Staff.findOne({username: username});
        res.send(user.notifications + "");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.get("/viewNotifications", verify, async (req, res) => {
    const { username, role } = req.staff;
    if (role !== "HR") {
        await Staff.updateOne({username: username}, {notifications: 0});
        const notifications = await Notification.find({user: username}).sort({'date': 'desc'});
        res.send(notifications);
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.post("/cancelDayOffRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await DayOffRequest.findById(requestId);
        if (!request) {
            return res.send("Request is not found");
        }
        if (request.status !== "P") {
            return res.send("You can only cancel pending day-off requests");
        } 
        else {
            await DayOffRequest.deleteOne({_id: requestId});
            return res.send("Request canceled successfully");
        }
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/cancelSlotLinking", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await SlotLinkingRequest.findById(requestId);
        if (!request) {
            return res.send("Request is not found");
        }
        if (request.status !== "P") {
            return res.send("You can only cancel pending slot linking requests");
        } 
        else {
            await SlotLinkingRequest.deleteOne({_id: requestId});
            return res.send("Request canceled successfully");
        }
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/cancelLeaveRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await LeaveRequest.findById(requestId);
        if (!request) {
            return res.send("Request is not found");
        }
        if (request.status === "P" || moment().isBefore(moment(request.date))) {
            await LeaveRequest.deleteOne({_id: requestId});
            return res.send("Request canceled successfully");
        } 
        return res.send("Can only cancel a request whose day is yet to come");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});

app.post("/cancelReplaceRequest", verify, async (req, res) => {
    const { username, role } = req.staff;
    const { requestId } = req.body;
    if (role !== "HR") {
        if (!mongoose.isValidObjectId(requestId)) {
            return res.send("requestId is not valid");
        }
        const request = await ReplaceRequest.findById(requestId);
        if (!request) {
            return res.send("Request is not found");
        }
        const replaceDate = request.slot.replacement;
        if (request.status === "P" || moment().isBefore(moment(replaceDate))) {
            const canceledRequest = await ReplaceRequest.findByIdAndDelete(requestId);
            if (request.status === "A") {
                const recipient = await Staff.findOne({username: canceledRequest.recipient});
                const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                const dayName = days[replaceDate.getDay()];
                for (let i=0; i<recipient.schedule.length; i++) {
                    if (recipient.schedule[i].day === dayName) {
                        const newSlots = recipient.schedule[i].slots.filter(slot => {
                            if (slot.replacement) {
                                const exclude = (canceledRequest.slot.start === slot.start) && moment(replaceDate).isSame(moment(slot.replacement));
                                return (!exclude);
                            }
                            else {
                                return true;
                            }
                        });
                        recipient.schedule[i].slots = newSlots;
                        break;
                    }
                }
                await Staff.updateOne({username: recipient.username}, {schedule: recipient.schedule});
            }
            return res.send("Request canceled successfully");
        } 
        return res.send("Can only cancel a request whose day is yet to come");
    }
    else {
        res.send("You are not authorized to do this functionality");
    }
});