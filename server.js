const express=require('express')
const app=express()
const ejs=require('ejs')
const bodyparser=require('body-parser')
const nodemailer=require('nodemailer')
const mongoose=require('mongoose')
const stringify = require('postcss/lib/stringify')
const jwt =require('jsonwebtoken')
const session=require('express-session')
const { MongoNetworkError } = require('mongodb')
const MongoDBStore = require('connect-mongodb-session')(session);
require('dotenv').config()

app.use(express.static('views'))
app.set('view engine','ejs')
app.use(express.json())
app.use(bodyparser.urlencoded({extended: false}))
app.use(express.static('views'));

//sessions store
const store = new MongoDBStore({
  uri: 'mongodb://127.0.0.1:27017/pass_db',
  collection: 'mySessions'
});
app.use(session({
    secret: 'your secret',
    resave: true,
    saveUninitialized: false,
    store: store
  }));

//authenticate sessions
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

//function to generate new password
function generatePassword(length = 12) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&*';
    let password = '';
    for (let i = 0, n = charset.length; i < length; ++i) {
      password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
  }

//mongoose connection
mongoose
  .connect(process.env.MONGO_URL,{
    useNewUrlParser : true
  }).then(() => console.log("Database connected!"))
  .catch(err => console.log(err));

//object schemas
const master_password_schema=new mongoose.Schema({
    username_id:mongoose.Schema.Types.ObjectId,
    master:String
})
const userschema=new mongoose.Schema({
    firstname:String,
    lastname:String,
    email:String,
    password:String
})
const contactschema=new mongoose.Schema({
    fullname:String,
    email:String,
    subject:String,
    message:String
})
const saved_pass_schema=new mongoose.Schema({
  user_id:mongoose.Schema.Types.ObjectId,
  saved:[{
     website:String,
     saved_password:String
  }]
})

//models
const User=mongoose.model('User',userschema)
const contact=mongoose.model('contact',contactschema)
const master_key=mongoose.model('master_key',master_password_schema)
const Saved_pass=mongoose.model('Saved_pass',saved_pass_schema)

//home route
app.get('/',(req,res)=>{
   res.render('../views/index')
})

//contact routes
app.get('/contact',(req,res)=>{ 
    res.render('../views/contact')
})
app.post('/contact',(req,res)=>{
    const new_contact=new contact({
        fullname:req.body.fullname,
        email:req.body.email,
        subject:req.body.subject,
        message: req.body.message
    })
    new_contact.save();
    res.send('Mail Sent')
})

//login routes
app.get('/login', function(req, res) {
    res.render('../views/login')
  });
app.post('/login',async (req,res)=>{
    const name=req.body.email
    const pass=req.body.password
    const user=await User.findOne({email:name,password:pass});
    if(user){
        req.session.user = user;
        res.render('../views/user',{username:name})
     }
     else{
        res.render('../views/login')
     }
})

//set master password route
app.get('/login/set',isAuthenticated,async(req,res)=>{
    res.render('../views/set')
})
app.post('/login/set',isAuthenticated,async (req,res)=>{
   const new_key=new master_key({
    username_id:req.session.user._id,
    master:req.body.password
   })
   new_key.save();
   res.redirect('/login/set')
})

//add password route
app.get('/login/addpass',isAuthenticated,(req,res)=>{
    res.render('../views/addpass')
})
app.post('/login/addpass',isAuthenticated,async(req,res)=>{
    const check_master=req.body.master_password
    const add_pass=req.body.password
    const web=req.body.website
      if(await master_key.findOne({master:check_master})){
        if(await Saved_pass.findOne({user_id:req.session.user._id})){
          await Saved_pass.updateOne({ user_id: req.session.user._id }, {
             $push: { 
                saved:[{
                  website:web,
                  saved_password:add_pass
                }]
          } })
         }
        else{
          const new_save=new Saved_pass({
            user_id:req.session.user._id,
            saved:[{
              website:web,
              saved_password:add_pass
            }]
          })
          new_save.save()
        }
        res.render('../views/addpass')
     }
     else{
        req.session.destroy();
        res.redirect('/login');
     }
})

//viewing the saved passwords route
app.get('/login/view',isAuthenticated,async(req,res)=>{
    await Saved_pass.findOne({user_id:req.session.user._id}).then((data)=>{
       res.render('saved',{savedPasswords:data.saved})
    }).catch((err)=>{
       console.log(err)
    })
})

//checking the strength
app.get('/login/strength',isAuthenticated,(req,res)=>{
  res.render('../views/strength')
})

//generating the password route
app.get('/login/generate',isAuthenticated,(req,res)=>{
  res.render('../views/generate')
})

//updating the password
app.get('/login/update',isAuthenticated,(req,res)=>{
  res.render('../views/update')
})
app.post('/login/update',isAuthenticated,async(req,res)=>{
   const websites=req.body.web
   const new_pass=req.body.update_password
   const master_ps=req.body.master_password
   if(await master_key.findOne({master:master_ps})){
       if(await Saved_pass.findOne({user_id:req.session.user._id})){
         await Saved_pass.updateOne({ user_id: req.session.user._id, "saved.website":websites },{
           $set:{
             "saved.$.saved_password":new_pass
           }
         }
        )
       }
       res.render('../views/update')
   }
   else{
     res.status(201)
   }
})

//deleting the password
app.get('/login/delete',isAuthenticated,(req,res)=>{
  res.render('../views/delete')
})
app.post('/login/delete',isAuthenticated,async(req,res)=>{
   const mster_key=req.body.master_password
   const web_page=req.body.web
   const sav_passw=req.body.saved_keys
   if(await master_key.findOne({master:mster_key})){
     await Saved_pass.updateOne({user_id:req.session.user._id},{
       $pull:{
          saved:{
              website:web_page,
              saved_password:sav_passw
          }
       }
     })
   }
   res.redirect('/login/view')
})

//signup user route
app.get('/signup',(req,res)=>{
    res.render('../views/signup')
})
app.post('/signup',(req,res)=>{
   const new_user=new User({
      firstname: req.body.firstName,
      lastname: req.body.lastName,
      email:req.body.email,
      password:req.body.password
   })
   new_user.save();
   res.redirect('/login')
})

//password reset route
app.get('/reset',(req,res)=>{
    res.render('../views/password')
})
app.post('/reset',async(req,res)=>{
   const mail=req.body.email
   const reset=req.body.password_reset
   await User.updateOne({email:mail},{
    $set:{
      password: reset
    }
   })
   res.render('../views/login')
  })

//checkout route
app.get('/checkout',(req,res)=>{
    res.render('../views/checkout')
})

//logout route
app.post('/logout',(req,res)=>{
  req.session.destroy();
  res.redirect('/login')
})

//server & port
app.listen(3000,function(err){
    if(!err){
        console.log('server connected')
    }
    else{
        console.log('Error')
    }
})
