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

      console.log('E-mail sent to: ');
      console.log(to);
      next();
    });
  } else {
    console.log('No e-mail addresses');
    next();
  }
}

export default sendNotification;
