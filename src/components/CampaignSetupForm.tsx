"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Globe, MapPin, Plus, Trash2, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { LocationCombobox } from "@/components/LocationCombobox";
import { campaignSchema, type CampaignFormValues } from "@/lib/schemas";
import { submitCampaign } from "@/app/actions/campaign";

// Framer motion variants
const slideVariants: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
  exit: { opacity: 0, x: -50, transition: { duration: 0.3, ease: "easeIn" } },
};

const steps = [
  { id: "identity", title: "Brand Identity", description: "Tell us about your brand.", fields: ["brandName", "brandWebsite", "brandDescription"] },
  { id: "scope", title: "Target Scope", description: "Where do you want to be recommended?", fields: ["targetScope"] },
  { id: "competitors", title: "Competitor Analysis", description: "Who are you competing against?", fields: ["competitors"] },
  { id: "keywords", title: "AI Triggers", description: "Keywords for AI recommendation.", fields: ["keywords"] },
  { id: "success", title: "Ready for AI", description: "Your brand is set up for the future.", fields: [] },
];

export function CampaignSetupForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      brandName: "",
      brandWebsite: "",
      brandDescription: "",
      targetScope: "global",
      location: [],
      competitors: [
        { name: "", url: "", required: true },
        { name: "", url: "", required: true },
        { name: "", url: "", required: true },
      ],
      keywords: ["", "", "", "", ""],
    },
    mode: "onTouched",
  });

  const { fields: competitorFields, append: appendCompetitor, remove: removeCompetitor } = useFieldArray({
    control: form.control,
    name: "competitors",
  });

  const watchTargetScope = form.watch("targetScope");

  const handleNext = async () => {
    const fieldsToValidate = steps[currentStep].fields as Array<keyof CampaignFormValues>;
    const isStepValid = await form.trigger(fieldsToValidate);

    if (isStepValid && currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else if (!isStepValid) {
      toast.error("Please fix the errors before proceeding.");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
  };

  const onSubmit = async (data: CampaignFormValues) => {
    try {
      setIsSubmitting(true);
      const result = await submitCampaign(data);

      if (result.success) {
        toast.success("Campaign successfully launched!");
        setCurrentStep(steps.length - 1); // Move to success step
      } else {
        toast.error(result.error || "Failed to submit campaign.");
      }
    } catch (error) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto relative">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex flex-col items-center flex-1 ${
                index <= currentStep ? "text-indigo-400" : "text-slate-600"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2 transition-colors duration-300 ${
                  index < currentStep
                    ? "bg-indigo-500 text-white"
                    : index === currentStep
                    ? "bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500"
                    : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
              >
                {index < currentStep ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block">{step.title}</span>
            </div>
          ))}
        </div>
        <div className="relative w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
            initial={{ width: "0%" }}
            animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl shadow-indigo-500/10 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-slate-100">
                {steps[currentStep].title}
              </CardTitle>
              <CardDescription className="text-slate-400 text-base">
                {steps[currentStep].description}
              </CardDescription>
            </CardHeader>

            <CardContent className="min-h-[400px] relative z-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  variants={slideVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-6"
                >
                  {/* STEP 1: Brand Identity */}
                  {currentStep === 0 && (
                    <div className="space-y-6">
                      <FormField
                        control={form.control}
                        name="brandName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300">Brand Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Nexus Branding" className="bg-slate-950/50 border-slate-700 focus-visible:ring-indigo-500 transition-all" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="brandWebsite"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300">Website URL</FormLabel>
                            <FormControl>
                              <Input placeholder="google.com" className="bg-slate-950/50 border-slate-700 focus-visible:ring-indigo-500 transition-all" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="brandDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300">Detailed Description</FormLabel>
                            <p className="text-xs text-slate-500 mb-2">Describe what your brand does in detail so AI can understand your unique value.</p>
                            <FormControl>
                              <div className="relative">
                                <Textarea 
                                  placeholder="We provide AI-powered branding solutions..." 
                                  className="min-h-[120px] bg-slate-950/50 border-slate-700 focus-visible:ring-indigo-500 transition-all resize-none pb-8" 
                                  {...field} 
                                />
                                <div 
                                  className={cn(
                                    "absolute bottom-2 right-3 text-xs transition-colors", 
                                    field.value.length < 10 || field.value.length > 500 ? "text-red-400 font-medium" : "text-slate-500"
                                  )}
                                >
                                  {field.value.length} / 500
                                </div>
                              </div>
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* STEP 2: Target Scope */}
                  {currentStep === 1 && (
                    <div className="space-y-6">
                      <FormField
                        control={form.control}
                        name="targetScope"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                              >
                                <div>
                                  <RadioGroupItem value="local" id="scope-local" className="sr-only" />
                                  <Label
                                    htmlFor="scope-local"
                                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-all group ${
                                      field.value === "local"
                                        ? "border-indigo-500 bg-indigo-500/10"
                                        : "border-slate-800"
                                    }`}
                                  >
                                    <MapPin 
                                      className={`w-10 h-10 mb-4 transition-colors ${
                                        field.value === "local" ? "text-indigo-400" : "text-slate-400 group-hover:text-indigo-400"
                                      }`} 
                                    />
                                    <span className="text-lg font-semibold text-slate-200">Local Scope</span>
                                    <span className="text-sm text-slate-500 text-center mt-2">City or state specific</span>
                                  </Label>
                                </div>
                                <div>
                                  <RadioGroupItem value="regional" id="scope-regional" className="sr-only" />
                                  <Label
                                    htmlFor="scope-regional"
                                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-all group ${
                                      field.value === "regional"
                                        ? "border-indigo-500 bg-indigo-500/10"
                                        : "border-slate-800"
                                    }`}
                                  >
                                    <MapPin 
                                      className={`w-10 h-10 mb-4 transition-colors ${
                                        field.value === "regional" ? "text-indigo-400" : "text-slate-400 group-hover:text-indigo-400"
                                      }`} 
                                    />
                                    <span className="text-lg font-semibold text-slate-200">Regional Scope</span>
                                    <span className="text-sm text-slate-500 text-center mt-2">Country specific</span>
                                  </Label>
                                </div>
                                <div>
                                  <RadioGroupItem value="global" id="scope-global" className="sr-only" />
                                  <Label
                                    htmlFor="scope-global"
                                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-all group ${
                                      field.value === "global"
                                        ? "border-indigo-500 bg-indigo-500/10"
                                        : "border-slate-800"
                                    }`}
                                  >
                                    <Globe 
                                      className={`w-10 h-10 mb-4 transition-colors ${
                                        field.value === "global" ? "text-indigo-400" : "text-slate-400 group-hover:text-indigo-400"
                                      }`} 
                                    />
                                    <span className="text-lg font-semibold text-slate-200">Global Scope</span>
                                    <span className="text-sm text-slate-500 text-center mt-2">Worldwide visibility</span>
                                  </Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />

                      {(watchTargetScope === "local" || watchTargetScope === "regional") && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <FormField
                            control={form.control}
                            name="location"
                            render={({ field }) => (
                              <FormItem className="mt-4">
                                <FormLabel className="text-slate-300">Target Location</FormLabel>
                                <FormControl>
                                  <LocationCombobox 
                                    value={field.value} 
                                    onChange={field.onChange} 
                                    targetScope={watchTargetScope} 
                                  />
                                </FormControl>
                                <FormMessage className="text-red-400" />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* STEP 3: Competitors */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400 mb-4">
                        List up to 5 competitors to help the AI understand your market positioning. (3 Required)
                      </p>
                      
                      {competitorFields.map((comp, index) => (
                        <motion.div
                          key={comp.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-950/30 border border-slate-800 rounded-lg relative group"
                        >
                          <FormField
                            control={form.control}
                            name={`competitors.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel className="text-xs text-slate-500">
                                  Competitor Name {index < 3 && <span className="text-indigo-400">*</span>}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Acme Corp" className="bg-slate-900 border-slate-700 h-9 text-sm" {...field} />
                                </FormControl>
                                <FormMessage className="text-red-400 text-xs" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`competitors.${index}.url`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel className="text-xs text-slate-500">
                                  Website URL {index < 3 && <span className="text-indigo-400">*</span>}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="acme.com" className="bg-slate-900 border-slate-700 h-9 text-sm" {...field} />
                                </FormControl>
                                <FormMessage className="text-red-400 text-xs" />
                              </FormItem>
                            )}
                          />
                          
                          {index >= 3 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="sm:self-end h-9 w-9 text-slate-500 hover:text-red-400 hover:bg-red-500/10 absolute right-2 top-2 sm:relative sm:right-auto sm:top-auto opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeCompetitor(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </motion.div>
                      ))}

                      {competitorFields.length < 5 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-dashed border-slate-700 text-slate-400 hover:text-indigo-400 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all"
                          onClick={() => appendCompetitor({ name: "", url: "", required: false })}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Competitor (Optional)
                        </Button>
                      )}
                      {/* Overall competitors array error */}
                      {form.formState.errors.competitors?.message && typeof form.formState.errors.competitors.message === 'string' && (
                        <p className="text-sm font-medium text-red-400">{form.formState.errors.competitors.message}</p>
                      )}
                    </div>
                  )}

                  {/* STEP 4: AI Triggers */}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400 mb-4">
                        Enter up to 5 exact questions or keywords where you want AI to recommend your brand.
                      </p>
                      
                      <div className="grid gap-3">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <FormField
                            key={`keyword-${index}`}
                            control={form.control}
                            name={`keywords.${index}`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative flex items-center">
                                    <div className="absolute left-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-400">
                                      {index + 1}
                                    </div>
                                    <Input
                                      placeholder={
                                        index === 0 ? "e.g. Best AI branding agencies?" : 
                                        index === 1 ? "e.g. How to automate brand identity?" : 
                                        "Enter AI trigger question or keyword"
                                      }
                                      className="pl-12 bg-slate-950/50 border-slate-700 focus-visible:ring-indigo-500"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage className="text-red-400 text-xs" />
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 5: Success/Confirmation */}
                  {currentStep === 4 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                      <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 relative">
                        <Sparkles className="w-10 h-10 text-indigo-400" />
                        <motion.div 
                          className="absolute inset-0 border-2 border-indigo-400 rounded-full"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1.2, opacity: 0 }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                        />
                      </div>
                      <h3 className="text-2xl font-bold text-white">System Calibration Complete</h3>
                      <p className="text-slate-400 max-w-md">
                        Your brand's DNA has been mapped. We are ready to inject it into AI recommendation engines globally.
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </CardContent>

            <CardFooter className="flex justify-between border-t border-slate-800/50 pt-6 relative z-10">
              {currentStep > 0 && currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isSubmitting}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              ) : (
                <div /> // Placeholder for spacing
              )}

              {currentStep < steps.length - 2 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all"
                >
                  Next Step <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : currentStep === steps.length - 2 ? (
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/25 transition-all w-full sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Launching...
                    </>
                  ) : (
                    <>
                      Launch Campaign <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : null}
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
