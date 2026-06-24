"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fingerprint, Loader2, Shield, Globe } from "lucide-react";
import { toast } from "sonner";
import { platformAccountSchema, PlatformAccountFormValues } from "@/lib/schemas";
import { savePlatformAccount } from "@/app/actions/admin";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLATFORMS = ["Quora", "Reddit", "Medium", "Dev.to", "GitHub", "LinkedIn"] as const;

type ExistingAccount = { platform: string, slot: number, authType: string, hasProxy: boolean };

export function PlatformAccountsForm({ existingAccounts = [] }: { existingAccounts?: ExistingAccount[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<any>({
    resolver: zodResolver(platformAccountSchema),
    defaultValues: {
      platform: "Quora",
      slot: 1,
      authType: "Cookies",
      cookie: "",
      apiKey: "",
      proxy: "",
    },
  });

  async function onSubmit(data: any) {
    const isExisting = existingAccounts.some(acc => acc.platform === data.platform && acc.slot === data.slot);
    if (isExisting) {
      const confirmOverwrite = window.confirm(`Slot ${data.slot} for ${data.platform} is already configured. Are you sure you want to replace it?`);
      if (!confirmOverwrite) return;
    }

    setIsSubmitting(true);
    try {
      const res = await savePlatformAccount(data);
      if (res.success) {
        toast.success(`${data.platform} Account (Slot ${data.slot}) saved successfully!`);
        
        // Optimistic update
        const existingIdx = existingAccounts.findIndex(acc => acc.platform === data.platform && acc.slot === data.slot);
        const newAcc = { platform: data.platform, slot: data.slot, authType: data.authType, hasProxy: !!data.proxy };
        if (existingIdx !== -1) {
          existingAccounts[existingIdx] = newAcc;
        } else {
          existingAccounts.push(newAcc);
        }

        form.reset({ ...data, cookie: "", apiKey: "", proxy: "" });
      } else {
        toast.error(res.error || "Failed to save platform account.");
      }
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      
      {existingAccounts.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-slate-200 mb-3">Configured Accounts ({existingAccounts.length})</h4>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {PLATFORMS.map((platform) => {
              const platformAccs = existingAccounts.filter(acc => acc.platform === platform).sort((a,b) => a.slot - b.slot);
              if (platformAccs.length === 0) return null;
              
              return (
                <div key={platform} className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2 border-b border-slate-800/50 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-indigo-300 min-w-20">{platform}</span>
                  <div className="flex flex-wrap gap-2">
                    {platformAccs.map(acc => (
                      <div key={acc.slot} className="text-xs px-2 py-1 rounded-md border bg-slate-800/50 border-slate-700 text-slate-400 flex items-center gap-1.5">
                        <span className="font-medium text-slate-300">Slot {acc.slot}</span>
                        <span className="text-slate-500">|</span>
                        <span>{acc.authType}</span>
                        {!acc.hasProxy && (
                           <span className="text-amber-500/90 ml-1 font-semibold flex items-center gap-1">
                             <span className="text-xs">⚠️ No Proxy</span>
                           </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Platform</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-950/50 border-slate-700">
                        <SelectValue placeholder="Select Platform" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      {PLATFORMS.map((platform) => (
                        <SelectItem key={platform} value={platform}>
                          {platform}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Account Slot</FormLabel>
                  <Select onValueChange={(val) => field.onChange(parseInt(val as string, 10))} value={String(field.value)}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-950/50 border-slate-700">
                        <SelectValue placeholder="Select Slot" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      {[...Array(10)].map((_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          Account {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="authType"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Authentication Method</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-slate-950/50 border-slate-700 w-full">
                      <SelectValue placeholder="Select Auth Type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false} className="bg-slate-900 border-slate-800 text-slate-200">
                    <SelectItem value="Cookies">Cookies (Browser Automation)</SelectItem>
                    <SelectItem value="API Key">API Key (Direct Posting)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          {form.watch("authType") === "Cookies" ? (
            <FormField
              control={form.control}
              name="cookie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300 flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-purple-400" />
                    Cookie JSON
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder='[{"domain": ".quora.com", "name": "m-b", "value": "..."}]'
                      className="bg-slate-950/50 border-slate-700 font-mono text-sm h-32"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          ) : (
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    API Key
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder='Enter API Key (e.g. Bearer token, App secret...)'
                      className="bg-slate-950/50 border-slate-700 font-mono text-sm"
                      type="password"
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="proxy"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Proxy IP (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      placeholder="http://user:pass@ip:port" 
                      className="pl-10 bg-slate-950/50 border-slate-700 font-mono text-sm" 
                      {...field} 
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-red-400" />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Shield className="w-4 h-4 mr-2" />
            )}
            Save Account Config
          </Button>
        </form>
      </Form>
    </div>
  );
}
