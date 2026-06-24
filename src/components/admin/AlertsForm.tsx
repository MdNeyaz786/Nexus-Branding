"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SystemConfigFormValues, systemConfigSchema } from "@/lib/schemas";
import { saveSystemConfig } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Save, Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export function AlertsForm({ existingConfig }: { existingConfig: { telegram_bot_token: string, telegram_chat_id: string, pexels_api_key?: string } | null }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<SystemConfigFormValues>({
    resolver: zodResolver(systemConfigSchema),
    defaultValues: {
      telegramBotToken: existingConfig?.telegram_bot_token || "",
      telegramChatId: existingConfig?.telegram_chat_id || "",
      pexelsApiKey: existingConfig?.pexels_api_key || "",
    },
  });

  async function onSubmit(data: SystemConfigFormValues) {
    setIsSubmitting(true);
    try {
      const res = await saveSystemConfig(data);
      if (res.success) {
        toast.success("System configuration saved successfully!");
      } else {
        toast.error(res.error || "Failed to save configuration.");
      }
    } catch (error) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-sm text-indigo-200 flex gap-3">
        <Bell className="w-5 h-5 text-indigo-400 shrink-0" />
        <p>
          Configure your Telegram Bot token, Chat ID, and global API keys here. The system will send automated alerts to Telegram, and workers will use the global API keys (like Pexels) for their tasks.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="telegramBotToken"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Telegram Bot Token</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz" 
                    className="bg-slate-950/50 border-slate-700 font-mono text-sm" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription className="text-slate-500">
                  Get this from BotFather on Telegram.
                </FormDescription>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telegramChatId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Telegram Chat ID</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g. 123456789 or -100123456789" 
                    className="bg-slate-950/50 border-slate-700 font-mono text-sm" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription className="text-slate-500">
                  The ID of the user, group, or channel where alerts should be sent.
                </FormDescription>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pexelsApiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Pexels API Key (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g. 563492ad6f91700001000001xxxxxxxxxxxxxxxxxxxxxxxx" 
                    className="bg-slate-950/50 border-slate-700 font-mono text-sm" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription className="text-slate-500">
                  Used by the X (Twitter) worker to fetch and upload background images. Get it from pexels.com/api.
                </FormDescription>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white transition-all h-11 rounded-lg font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </form>
      </Form>
    </div>
  );
}
