/**
 * Contact Message data types and validation matching the Supabase public.contact_messages schema.
 */

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CreateContactMessageInput {
  name: string;
  email: string;
  message: string;
}

export interface ContactValidationResult {
  valid: boolean;
  errors: {
    name?: string | undefined;
    email?: string | undefined;
    message?: string | undefined;
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates contact message inputs according to database constraints and business rules.
 */
export function validateContactInput(input: {
  name?: unknown;
  email?: unknown;
  message?: unknown;
}): ContactValidationResult {
  const errors: { name?: string; email?: string; message?: string } = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters.";
  } else if (name.length > 100) {
    errors.name = "Name must not exceed 100 characters.";
  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Please enter a valid email address.";
  } else if (email.length > 255) {
    errors.email = "Email must not exceed 255 characters.";
  }

  if (!message) {
    errors.message = "Message is required.";
  } else if (message.length < 5) {
    errors.message = "Message must be at least 5 characters.";
  } else if (message.length > 5000) {
    errors.message = "Message must not exceed 5000 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Formats a message creation timestamp into a human-readable format.
 */
export function formatMessageDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateString;
  }
}
