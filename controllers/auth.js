const crypto = require('crypto');

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');
const { validationResult } = require('express-validator');

const User = require('../models/user');

const transporter = nodemailer.createTransport(
  sendgridTransport({
    auth: {
      api_key:
        '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'
    }
  })
);

const getLogin = (req, res) => {
  let errorMessage = req.flash('error');

  if (errorMessage.length > 0) {
    errorMessage = errorMessage[0];
  } else {
    errorMessage = null;
  }

  res.render('auth/login', {
    pageTitle: 'Login',
    path: '/login',
    errorMessage,
    oldInput: {
      email: '',
      password: ''
    },
    validationErrors: []
  });
};

const postLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      pageTitle: 'Login',
      path: '/login',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email,
        password
      },
      validationErrors: errors.array()
    });
  }

  User.findOne({ email })
    .then(user => {
      if (!user) {
        return res.status(422).render('auth/login', {
          pageTitle: 'Login',
          path: '/login',
          errorMessage: 'Invalid email or password',
          oldInput: {
            email,
            password
          },
          validationErrors: []
        });
      }

      bcrypt
        .compare(password, user.password)
        .then(doMatch => {
          if (!doMatch) {
            return res.status(422).render('auth/login', {
              pageTitle: 'Login',
              path: '/login',
              errorMessage: 'Invalid email or password',
              oldInput: {
                email,
                password
              },
              validationErrors: []
            });
          }

          req.session.isLoggedIn = true;
          req.session.user = user;

          req.session.save(err => {
            console.log(err);

            res.redirect('/');
          });
        })
        .catch(err => {
          console.log(err);

          res.redirect('/login');
        });
    })

    .catch(err => {
      console.log(err);

      const error = new Error(err);

      error.httpStatusCode = 500;

      return next(error);
    });
};

const getSignup = (req, res) => {
  let errorMessage = req.flash('error');

  if (errorMessage.length > 0) {
    errorMessage = errorMessage[0];
  } else {
    errorMessage = null;
  }

  res.render('auth/signup', {
    pageTitle: 'Signup',
    path: '/signup',
    errorMessage,
    oldInput: {
      email: '',
      password: '',
      confirmPassword: ''
    },
    validationErrors: []
  });
};

const postSignup = (req, res, next) => {
  const { email, password, confirmPassword } = req.body;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/signup', {
      pageTitle: 'Signup',
      path: '/signup',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email,
        password,
        confirmPassword
      },
      validationErrors: errors.array()
    });
  }

  bcrypt
    .hash(password, 12)
    .then(hashedPassword => {
      const newUser = new User({
        email,
        password: hashedPassword,
        cart: { items: [] }
      });

      return newUser.save();
    })
    .then(() => {
      res.redirect('/login');

      return transporter.sendMail({
        to: email,
        from: 'rostik-911@ukr.net',
        subject: 'Signup succeeded!',
        html: '<h1>You successfully signed up!</h1>'
      });
    })
    .catch(err => {
      console.log(err);

      const error = new Error(err);

      error.httpStatusCode = 500;

      return next(error);
    });
};

const postLogout = (req, res) => {
  req.session.destroy(err => {
    console.log(err);

    res.redirect('/');
  });
};

const getReset = (req, res) => {
  let errorMessage = req.flash('error');

  if (errorMessage.length > 0) {
    errorMessage = errorMessage[0];
  } else {
    errorMessage = null;
  }

  res.render('auth/reset', {
    pageTitle: 'Reset Password',
    path: '/reset',
    errorMessage
  });
};

const postReset = (req, res, next) => {
  crypto.randomBytes(32, (err, buffer) => {
    if (err) {
      console.log(err);

      return res.redirect('/reset');
    }

    const token = buffer.toString('hex');

    User.findOne({ email: req.body.email })
      .then(user => {
        if (!user) {
          req.flash('error', 'No account with that email found.');

          return res.redirect('/reset');
        }

        user.resetToken = token;
        user.resetTokenExpiration = Date.now() + 60 * 60 * 1000; // 1 hour

        return user.save();
      })
      .then(result => {
        if (!result) {
          return;
        }

        res.redirect('/');

        return transporter.sendMail({
          to: req.body.email,
          from: 'rostik-911@ukr.net',
          subject: 'Password reset ',
          html: `
            <p>You requested a password reset</p>
            <p>Click <a href="http://localhost:3000/reset/${token}">this link</a> to set a new password.</p>
          `
        });
      })
      .catch(err => {
        console.log(err);

        const error = new Error(err);

        error.httpStatusCode = 500;

        return next(error);
      });
  });
};

const getNewPassword = (req, res, next) => {
  const token = req.params.token;

  User.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: Date.now() }
  })
    .then(user => {
      let errorMessage = req.flash('error');

      if (errorMessage.length > 0) {
        errorMessage = errorMessage[0];
      } else {
        errorMessage = null;
      }

      res.render('auth/new-password', {
        pageTitle: 'New Password',
        path: '/new-password',
        errorMessage,
        userId: user._id.toString(),
        passwordToken: token
      });
    })
    .catch(err => {
      console.log(err);

      const error = new Error(err);

      error.httpStatusCode = 500;

      return next(error);
    });
};

const postNewPassword = (req, res, next) => {
  const { password, passwordToken, userId } = req.body;
  let resetUser;

  User.findOne({
    _id: userId,
    resetToken: passwordToken,
    resetTokenExpiration: { $gt: Date.now() }
  })
    .then(user => {
      resetUser = user;

      return bcrypt.hash(password, 12);
    })
    .then(hashedPassword => {
      resetUser.password = hashedPassword;
      resetUser.resetToken = undefined;
      resetUser.resetTokenExpiration = undefined;

      return resetUser.save();
    })
    .then(() => {
      res.redirect('/login');
    })
    .catch(err => {
      console.log(err);

      const error = new Error(err);

      error.httpStatusCode = 500;

      return next(error);
    });
};

module.exports = {
  getLogin,
  postLogin,
  getSignup,
  postSignup,
  postLogout,
  getReset,
  postReset,
  getNewPassword,
  postNewPassword
};
