const mongoose = require("mongoose");
const locations = mongoose.Schema({
    location_name:{
        type:String,
        required:true,
    },
    location_type:{
        type:String,
    },
    capacity:{
        type:Number,
    },
    occupiedPlaces:{
        type:Number,
    }
});

module.exports = mongoose.model('Location',locations);