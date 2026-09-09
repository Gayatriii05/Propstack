const { z } = require('zod');

const isPositiveInt = () =>
  z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/, 'must be a positive integer')])
    .transform(Number);

const isNonNegativeNumber = (path = 'value') =>
  z
    .union([z.number().finite(), z.string().regex(/^\d+(\.\d+)?$/, 'must be a number')])
    .transform(Number)
    .refine((n) => n >= 0, `${path} must be >= 0`);

const isDateString = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');

const authSchemas = {
  register: z.object({
    name: z.string().min(1, 'name is required').max(120),
    email: z.string().email('email must be a valid email'),
    password: z.string().min(8, 'password must be at least 8 characters').max(128),
    role: z.enum(['owner', 'manager', 'tenant']),
  }),
  login: z.object({
    email: z.string().email('email must be a valid email'),
    password: z.string().min(1, 'password is required'),
  }),
};

const propertySchemas = {
  create: z.object({
    name: z.string().min(1, 'name is required').max(150),
    address: z.string().min(1, 'address is required').max(255),
    city: z.string().min(1, 'city is required').max(100),
  }),
};

const unitSchemas = {
  create: z.object({
    property_id: isPositiveInt(),
    unit_number: z.string().min(1, 'unit_number is required').max(20),
    rent_amount: isNonNegativeNumber('rent_amount'),
    bedrooms: z.optional(isPositiveInt()),
  }),
};

const leaseSchemas = {
  create: z.object({
    unit_id: isPositiveInt(),
    tenant_id: isPositiveInt(),
    start_date: isDateString(),
    end_date: isDateString(),
    monthly_rent: isNonNegativeNumber('monthly_rent'),
    security_deposit: z.optional(isNonNegativeNumber('security_deposit')),
  }),
};

const paymentSchemas = {
  create: z.object({
    lease_id: isPositiveInt(),
    amount: isNonNegativeNumber('amount'),
    due_date: isDateString(),
  }),
};

const maintenanceSchemas = {
  create: z.object({
    unit_id: isPositiveInt(),
    description: z.string().min(1, 'description is required').max(5000),
    priority: z.optional(z.enum(['low', 'medium', 'high', 'urgent'])),
  }),
  status: z.object({
    status: z.enum(['open', 'in_progress', 'resolved'], { errorMap: () => ({ message: 'invalid status' }) }),
  }),
};

module.exports = {
  authSchemas,
  propertySchemas,
  unitSchemas,
  leaseSchemas,
  paymentSchemas,
  maintenanceSchemas,
};