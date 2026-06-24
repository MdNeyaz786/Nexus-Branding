"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Key, Database, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { aiKeySchema, AiKeyFormValues } from "@/lib/schemas";
import { saveAiKey } from "@/app/actions/admin";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AiKeysForm({ existingKeys = [] }: { existingKeys?: number[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AiKeyFormValues>({
    resolver: zodResolver(aiKeySchema),
    defaultValues: {
      slot: 1,
      key: "",
    },
  });

  async function onSubmit(data: AiKeyFormValues) {
    if (existingKeys.includes(data.slot)) {
      const confirmOverwrite = window.confirm(`Slot ${data.slot} already has a key configured. Are you sure you want to replace it?`);
      if (!confirmOverwrite) return;
    }

    setIsSubmitting(true);
    try {
      // Send as FormData so Next.js doesn't log the raw key in terminal
      const formData = new FormData();
      formData.append("slot", String(data.slot));
      formData.append("key", data.key);

      const res = await saveAiKey(formData);
      if (res.success) {
        toast.success(`AI Key saved in Slot ${data.slot} successfully!`);
        if (!existingKeys.includes(data.slot)) {
           existingKeys.push(data.slot); // Optimistic update
        }
        form.reset({ slot: data.slot, key: "" });
      } else {
        toast.error(res.error || "Failed to save AI key.");
      }
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 border border-indigo-500/20 rounded-lg p-4 flex items-start space-x-3">
        <Info className="w-5 h-5 text-indigo-400 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-slate-200">Round-Robin Fallback System</h4>
          <p className="text-xs text-slate-400 mt-1">
            The AEO engine cycles through active API keys to bypass rate limits. Store up to 10 Gemini keys. If Slot 1 fails, the system automatically falls back to Slot 2, and so on.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-3">Vault Status</h4>
        <div className="flex flex-wrap gap-2">
          {[...Array(10)].map((_, i) => {
            const slot = i + 1;
            const isFilled = existingKeys.includes(slot);
            return (
              <div 
                key={slot} 
                className={`text-xs px-2 py-1 rounded-md border ${isFilled ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}
              >
                Slot {slot}: {isFilled ? "🟢 Active" : "🔴 Empty"}
              </div>
            );
          })}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="slot"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Key Slot</FormLabel>
                <Select onValueChange={(val) => field.onChange(parseInt(val as string, 10))} value={String(field.value)}>
                  <FormControl>
                    <SelectTrigger className="bg-slate-950/50 border-slate-700">
                      <SelectValue placeholder="Select Slot" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    {[...Array(10)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        Slot {i + 1}
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
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-300">Gemini API Key</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      placeholder="AIzaSy..." 
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Database className="w-4 h-4 mr-2" />
            )}
            Save Key to Vault
          </Button>
        </form>
      </Form>
    </div>
  );
}
