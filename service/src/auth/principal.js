function principalFrom(claims) {
  const isServiceAccount = claims.sub === claims.azp; // Sesuaikan jika providernya berbeda

  return {
    subject: claims.sub,
    kind: isServiceAccount ? 'service' : 'user', 
    scopes: String(claims.scope ?? '').split(' ').filter(Boolean),
    tokenId: claims.jti, // JWT ID
  };
}

module.exports = { principalFrom };
