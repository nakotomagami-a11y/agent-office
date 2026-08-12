import { getRequestConfig } from "next-intl/server";

const SUPPORTED_LOCALES = ["en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupported(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const requested = process.env.DEFAULT_LOCALE ?? "en";
  const locale: Locale = isSupported(requested) ? requested : "en";
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
