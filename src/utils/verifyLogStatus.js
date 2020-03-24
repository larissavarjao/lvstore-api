function isUserLogged(request) {
  if (!request.userId) {
    throw new Error('You must be logged to create a item!');
  }
}

exports.isUserLogged = isUserLogged;
