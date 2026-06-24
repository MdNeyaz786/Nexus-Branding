import { z } from "zod";

const urlTransform = (val: string) => {
  if (!val) return val;
  // Prepend https:// if not present
  const transformed = val.startsWith("http://") || val.startsWith("https://") ? val : `https://${val}`;
  return transformed;
};

// Regex for validating that a URL has a proper domain extension
const domainExtensionRegex = /^https?:\/\/[^\s$.?#].[^\s]*\.[a-zA-Z]{2,}(\/.*)?$/;

export const campaignSchema = z.object({
  brandName: z.string().min(2, "Brand name must be at least 2 characters."),
  brandWebsite: z.string()
    .min(1, "Website is required.")
    .transform(urlTransform)
    .refine((val) => domainExtensionRegex.test(val), {
      message: "Please enter a valid URL with a proper domain extension (e.g., .com, .io).",
    }),
  brandDescription: z.string()
    .min(10, "Description must be at least 10 characters.")
    .max(500, "Description cannot exceed 500 characters."),
  targetScope: z.enum(["local", "regional", "global"]),
  location: z.array(z.string()).optional(),
  competitors: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Competitor name is required."),
      url: z.string()
        .min(1, "URL is required.")
        .transform(urlTransform)
        .refine((val) => domainExtensionRegex.test(val), {
          message: "Valid URL with extension required.",
        }),
      required: z.boolean().optional(),
    })
  )
    .min(3, "At least 3 competitors are required.")
    .max(5, "Maximum 5 competitors allowed."),
  keywords: z.array(z.string().min(1, "Keyword is required."))
    .min(1, "At least 1 keyword is required.")
    .max(5, "Maximum 5 keywords allowed."),
}).superRefine((data, ctx) => {
  if ((data.targetScope === "local" || data.targetScope === "regional") && (!data.location || data.location.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["location"],
      message: "At least one location is required for this scope.",
    });
  }
});

export type CampaignFormValues = z.infer<typeof campaignSchema>;

// Admin Config Schemas
export const aiKeySchema = z.object({
  slot: z.number().min(1).max(10),
  key: z.string().min(10, "Valid Gemini API Key is required."),
});

export type AiKeyFormValues = z.infer<typeof aiKeySchema>;

export const platformAccountSchema = z.object({
  platform: z.enum(["Quora", "Reddit", "Medium", "Dev.to", "GitHub", "LinkedIn"]),
  slot: z.number().min(1).max(10),
  authType: z.enum(["Cookies", "API Key"]).default("Cookies"),
  cookie: z.string().optional(),
  apiKey: z.string().optional(),
  proxy: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.authType === "Cookies") {
    if (!data.cookie) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cookie"], message: "Cookie is required when Auth Type is Cookies." });
    } else {
       try { 
         JSON.parse(data.cookie); 
       } catch { 
         ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cookie"], message: "Cookie must be a valid JSON string." }); 
       }
    }
  } else if (data.authType === "API Key" && !data.apiKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apiKey"], message: "API Key is required when Auth Type is API Key." });
  }
});

export type PlatformAccountFormValues = z.infer<typeof platformAccountSchema>;

export const systemConfigSchema = z.object({
  telegramBotToken: z.string().optional().or(z.literal("")),
  telegramChatId: z.string().optional().or(z.literal("")),
  pexelsApiKey: z.string().optional().or(z.literal("")),
});

export type SystemConfigFormValues = z.infer<typeof systemConfigSchema>;
