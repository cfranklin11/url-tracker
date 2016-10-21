import configAuth from '../config/auth.js';
import postmark from 'postmark';
const {postmark_key, doc_id} = configAuth;
const pmClient = new postmark.Client(postmark_key);

// Send notification e-mail
function sendNotification(req, res, next) {
  const {emailList} = req;

  if (emailList) {
    const receiversEmails = emailList.join(', ');

    pmClient.sendEmail({
      'From': 'search.melbourne@mediacom.com',
      'To': receiversEmails,
      'Subject': 'Check URL Errors',
      'TextBody': 'Check which URLs have changed, and which have errors here:' +
        '\nhttps://docs.google.com/spreadsheets/d/' + doc_id
    },
    (err, to) => {
      if (err) {
        console.log(err);
        next();
      }

      const date = new Date();
      console.log(date.toTimeString(), 'E-mail sent to: ');
      console.log(to);
      const runningTime = convertToTime(req.timer, date);
      console.log(`Total running time: ${runningTime}`);
      next();
    });
  } else {
    const date = new Date();
    console.log(date.toTimeString(), 'No e-mail addresses');
    const runningTime = convertToTime(req.runTimer, date);
    console.log(`Total running time: ${runningTime}`);
    next();
  }
}

function convertToTime(startTime, endTime) {
  const timeDiff = endTime - startTime;
  const rawSecs = timeDiff / 1000;
  const secs = Math.round(rawSecs % 60).toString();
  const mins = Math.floor(rawSecs / 60).toString();
  const revisedSecs = secs.length === 1 ? '0' + secs : secs;

  return `${mins}:${revisedSecs}`;
}

export default sendNotification;
