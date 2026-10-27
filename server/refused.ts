// What the admin asked that can't be done (admin-api.ts answers them): 400, or 404 for something that isn't there and 409 for
// something that is busy. Any other error is the server's (500).

export class Refused extends Error {}
export class Missing extends Refused {}
export class Busy extends Refused {}
