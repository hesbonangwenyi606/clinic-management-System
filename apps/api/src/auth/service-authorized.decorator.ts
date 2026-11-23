import { SetMetadata } from '@nestjs/common';

// Explicit opt-in for controllers whose methods enforce resource-level policies.
export const SERVICE_AUTHORIZED = 'serviceAuthorized';
export const ServiceAuthorized = () => SetMetadata(SERVICE_AUTHORIZED, true);
