import * as OTPAuth from "otpauth";

/** TOTP enrollment/verification for the MFA_REQUIRED_ROLES in packages/domain. */
export function generateMfaSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildOtpauthUri(params: { secret: string; email: string }): string {
  const totp = new OTPAuth.TOTP({
    issuer: "Laandry",
    label: params.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(params.secret),
  });
  return totp.toString();
}

/** Allows the immediately-adjacent time step on either side to tolerate clock drift. */
export function verifyTotp(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
