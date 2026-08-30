export function hasRole(profile, role) {
  return !!profile && profile.role === role;
}

export function hasAnyRole(profile, roles) {
  return !!profile && roles.includes(profile.role);
}
