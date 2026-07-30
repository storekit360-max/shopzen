const mongoose=require('mongoose');
const schema=new mongoose.Schema({key:{type:String,unique:true},expiresAt:Date},{timestamps:true});
module.exports=mongoose.models.SupplierSyncLock||mongoose.model('SupplierSyncLock',schema);
