const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { isUserLogged } = require('../utils/verifyLogStatus');
const { hasPermission } = require('../utils/hasPermission');

const cookieVariables = {
  httpOnly: true,
  maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
};

const Mutations = {
  async createItem(parent, args, ctx, info) {
    isUserLogged(ctx.request);

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          ...args,
          user: {
            connect: {
              id: ctx.request.userId
            }
          }
        }
      },
      info
    );

    return item;
  },
  async updateItem(parent, args, ctx, info) {
    const updates = { ...args };
    delete updates.id;

    return await ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id
        }
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    const item = await ctx.db.query.item({ where }, `{ id title user { id }}`);

    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'ITEMDELETE'].includes(permission)
    );

    if (!ownsItem && !hasPermissions) {
      throw new Error("You don't have permission to perform this action");
    }

    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    const password = await bcrypt.hash(args.password, 10);
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        }
      },
      info
    );

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    ctx.response.cookie('token', token, cookieVariables);

    return user;
  },
  async signin(parent, args, ctx, info) {
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error('There is no email/password with this values');
    }

    const valid = await bcrypt.compare(args.password, user.password);
    if (!valid) {
      throw new Error('There is no email/password with this values');
    }

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, cookieVariables);

    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');

    return { message: 'Goodbye' };
  },
  async requestReset(parent, args, ctx, info) {
    const user = await ctx.db.query.user({ where: { email: args.email } });

    if (!user) {
      throw new Error('There is no email/password with this values');
    }

    const randomBytesPromisified = promisify(randomBytes);
    const resetToken = (await randomBytesPromisified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // one hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    });

    const mailResponse = await transport.sendMail({
      from: 'larissasilvavarjao@gmail.com',
      to: user.email,
      subject: 'Your password reset Token',
      html: makeANiceEmail(
        `Your password reset token is here! \n\n
        <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">
          Click here to reset
        </a>`
      )
    });

    return { message: 'Hope you figure out your new password!' };
  },
  async resetPassword(parent, args, ctx, info) {
    if (args.password !== args.confirmPassword) {
      throw new Error("Your password don't match!");
    }

    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });

    if (!user) {
      throw new Error('Token expired!');
    }

    const password = await bcrypt.hash(args.password, 10);
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: { password, resetToken: null, resetTokenExpiry: null }
    });
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, cookieVariables);

    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    isUserLogged(ctx.request);
    const currentUser = await ctx.db.query.user(
      {
        where: { id: ctx.request.userId }
      },
      info
    );
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);

    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions
          }
        },
        where: { id: args.userId }
      },
      info
    );
  },
  async addCartItem(partent, args, ctx, info) {
    isUserLogged(ctx.request);

    const { userId } = ctx.request;
    const [existingCartItem] = await ctx.db.query.cartItems(
      {
        where: {
          user: {
            id: userId
          },
          item: { id: args.id }
        }
      },
      info
    );
    if (existingCartItem) {
      return ctx.db.mutation.updateCartItem(
        {
          where: { id: existingCartItem.id },
          data: { quantity: existingCartItem.quantity + 1 }
        },
        info
      );
    }

    return ctx.db.mutation.createCartItem(
      {
        data: {
          user: { connect: { id: userId } },
          item: { connect: { id: args.id } }
        }
      },
      info
    );
  },
  async removeFromCart(parent, args, ctx, info) {
    isUserLogged(ctx.request);

    const cartItem = await ctx.db.query.cartItem(
      { where: { id: args.id } },
      `{ id, user { id } }`
    );
    if (!cartItem) {
      throw new Error('No cart item found!');
    }

    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error("You don't have permission to access this item");
    }

    return ctx.db.mutation.deleteCartItem({ where: { id: args.id } }, info);
  }
};

module.exports = Mutations;
