const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const crypto=require("node:crypto");
initializeApp();
const db=getFirestore(),REGION="asia-southeast1";
async function teacher(r){if(!r.auth)throw new HttpsError("unauthenticated","Sign in is required.");const role=await db.doc("userRoles/"+r.auth.uid).get();if(!role.exists||role.data().role!=="teacher")throw new HttpsError("permission-denied","Teacher access required. Ask the project owner to assign your userRoles document the teacher role.");}
function signed(r){if(!r.auth)throw new HttpsError("unauthenticated","Sign in is required.");}
function validId(v){return typeof v==="string"&&/^[A-Za-z0-9_-]{12,80}$/.test(v);}
function answerId(v){return crypto.createHash("sha256").update(v).digest("hex");}
exports.checkTeacherAccess=onCall({region:REGION,invoker:"public"},async r=>{await teacher(r);return {authorized:true};});
exports.createSession=onCall({region:REGION,invoker:"public"},async r=>{await teacher(r);const id=crypto.randomBytes(18).toString("base64url");await db.doc("sessions/"+id).create({questionText:"",showQuestion:true,acceptResponses:true,totalAnswers:0,resetVersion:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return {sessionId:id};});
exports.joinSession=onCall({region:REGION,invoker:"public"},async r=>{signed(r);if(r.auth.token.teacher===true)throw new HttpsError("permission-denied","Teacher accounts cannot join as students.");const id=r.data?.sessionId;if(!validId(id))throw new HttpsError("invalid-argument","Invalid session link.");const sr=db.doc("sessions/"+id),mr=sr.collection("members").doc(r.auth.uid);const result=await db.runTransaction(async tx=>{const [s,m]=await Promise.all([tx.get(sr),tx.get(mr)]);if(!s.exists)throw new HttpsError("not-found","Session not found.");if(!m.exists)tx.create(mr,{joinedAt:FieldValue.serverTimestamp(),answered:false});return {alreadyAnswered:m.exists&&m.data().answered===true,resetVersion:Number(s.data().resetVersion||0)};});return {joined:true,alreadyAnswered:result.alreadyAnswered,resetVersion:result.resetVersion};});
exports.updateSession=onCall({region:REGION,invoker:"public"},async r=>{await teacher(r);const id=r.data?.sessionId;if(!validId(id))throw new HttpsError("invalid-argument","Invalid session.");const d=r.data||{},u={};if(Object.prototype.hasOwnProperty.call(d,"questionText")){if(typeof d.questionText!=="string"||d.questionText.length>500)throw new HttpsError("invalid-argument","Question must be 500 characters or fewer.");u.questionText=d.questionText.trim();}for(const k of ["showQuestion","acceptResponses"])if(Object.prototype.hasOwnProperty.call(d,k)){if(typeof d[k]!=="boolean")throw new HttpsError("invalid-argument","Invalid setting.");u[k]=d[k];}if(!Object.keys(u).length)throw new HttpsError("invalid-argument","No settings supplied.");u.updatedAt=FieldValue.serverTimestamp();await db.doc("sessions/"+id).update(u);return {updated:true};});
exports.resetSession=onCall({region:REGION,invoker:"public",timeoutSeconds:540,memory:"512MiB"},async r=>{
 await teacher(r);
 const id=r.data?.sessionId;
 if(!validId(id))throw new HttpsError("invalid-argument","Invalid session.");
 const sr=db.doc("sessions/"+id);
 const snap=await sr.get();
 if(!snap.exists)throw new HttpsError("not-found","Session not found.");
 await sr.update({resetting:true,updatedAt:FieldValue.serverTimestamp()});
 try{
  const members=await sr.collection("members").get();
  for(let i=0;i<members.docs.length;i+=450){
   const batch=db.batch();
   for(const member of members.docs.slice(i,i+450))batch.update(member.ref,{answered:false,answeredAt:FieldValue.delete()});
   await batch.commit();
  }
  await db.recursiveDelete(sr.collection("answerCounts"));
  await sr.update({totalAnswers:0,resetting:false,resetVersion:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
  return {reset:true,membersReset:members.size};
 }catch(e){
  await sr.update({resetting:false,updatedAt:FieldValue.serverTimestamp()}).catch(()=>{});
  throw new HttpsError("internal","Response reset did not complete. Check the session data before trying again.");
 }
});
exports.deleteAllData=onCall({region:REGION,invoker:"public",timeoutSeconds:540,memory:"512MiB"},async r=>{
 await teacher(r);
 if(r.data?.confirmation!=="DELETE ALL NUMVOTE DATA")throw new HttpsError("failed-precondition","Confirmation phrase does not match.");
 const sessions=await db.collection("sessions").get();
 let deleted=0;
 for(const session of sessions.docs){
  await db.recursiveDelete(session.ref);
  deleted++;
 }
 return {deleted:true,sessionsDeleted:deleted};
});
exports.submitAnswer=onCall({region:REGION,invoker:"public"},async r=>{signed(r);if(r.auth.token.teacher===true)throw new HttpsError("permission-denied","Teacher accounts cannot submit answers.");const id=r.data?.sessionId,a=r.data?.answer;if(!validId(id))throw new HttpsError("invalid-argument","Invalid session.");if(typeof a!=="string"||!/^(?:-?(?:0|[1-9]\d{0,8})(?:\.\d{1,8})?|YES|NO)$/.test(a))throw new HttpsError("invalid-argument","Invalid answer.");const sr=db.doc("sessions/"+id),mr=sr.collection("members").doc(r.auth.uid),cr=sr.collection("answerCounts").doc(answerId(a));await db.runTransaction(async tx=>{const [s,m,c]=await Promise.all([tx.get(sr),tx.get(mr),tx.get(cr)]);if(!s.exists||!m.exists)throw new HttpsError("permission-denied","You have not joined this session.");if(m.data().answered===true)throw new HttpsError("already-exists","You have already responded.");if(s.data().resetting===true)throw new HttpsError("failed-precondition","Session reset is in progress.");if(s.data().acceptResponses!==true)throw new HttpsError("failed-precondition","Responses are currently disabled.");tx.update(mr,{answered:true,answeredAt:FieldValue.serverTimestamp()});tx.set(cr,{answer:a,count:(c.exists?c.data().count:0)+1,updatedAt:FieldValue.serverTimestamp()});tx.update(sr,{totalAnswers:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});});return {accepted:true};});
