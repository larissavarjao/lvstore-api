const { forwardTo } = require('prisma-binding');
const { isUserLogged } = require('../utils/verifyLogStatus');
const { hasPermission } = require('../utils/hasPermission');

const Query = {
  items: forwardTo('db'),
  item: forwardTo('db'),
  itemsConnection: forwardTo('db'),
  me(parent, args, ctx, info) {
    const id = ctx.request.userId;
    if (!id) {
      return null;
    }

    return ctx.db.query.user({ where: { id } }, info);
  },
  async users(parent, args, ctx, info) {
    isUserLogged(ctx.request);
    const user = hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);

    return ctx.db.query.users({}, info);
  },
  async order(parent, args, ctx, info) {
    isUserLogged(ctx.request);

    const order = await ctx.db.query.order({ where: { id: args.id } }, info);
    const ownsOrder = order.user.id === ctx.request.userId;
    const hasPermissionToSeeOrder = ctx.request.user.permissions.includes(
      'ADMIN'
    );

    if (!ownsOrder && !hasPermissionToSeeOrder) {
      throw new Error("You don't have permission to see this.");
    }

    return order;
  }
};

module.exports = Query;
