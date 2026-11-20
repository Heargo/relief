export function formatDate(d: Date, locale = "fr-FR") {
  return new Intl.DateTimeFormat(locale).format(d);
}
