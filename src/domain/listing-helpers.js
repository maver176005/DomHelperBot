function buildOrderFromListing(listing, clientUser, options = {}) {
  const now = options.now || new Date().toISOString();
  const id = options.id || `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    type: 'service',
    serviceKey: listing.type === 'rental' ? 'rental_request' : 'listing_service',
    listingId: listing.id,
    listingType: listing.type,
    title: listing.title,
    status: 'assigned',
    houseId: listing.houseId,
    clientUserId: clientUser.id,
    providerUserId: listing.ownerUserId,
    comment: listing.description,
    urgencyKey: 'flexible',
    price: '',
    paymentMethod: listing.terms || 'договоримся',
    photoBeforeFileId: null,
    photoAfterFileId: null,
    repeatedFromOrderId: null,
    createdAt: now,
    assignedAt: now,
  };
}

module.exports = {
  buildOrderFromListing,
};
