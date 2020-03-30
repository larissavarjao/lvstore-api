const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendMail = (to, subject, text) => {
  const msg = {
    to,
    from: 'larissasilvavarjao@gmail.com',
    subject,
    text,
    html: `
    <div className="email" style="
      border: 1px solid black;
      padding: 20px;
      font-family: sans-serif;
      line-height: 2;
      font-size: 20px;
    ">
      <h2>Hello There!</h2>
      <p>${text}</p>
      <p>😘, Larissa Varjão</p>
    </div>
  `
  };

  sgMail.send(msg).catch(err => console.log({ message }));
};

exports.sendMail = sendMail;
