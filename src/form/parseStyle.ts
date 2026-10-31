// Reads the four style fields of the Design card from the form. A field that is missing or bad becomes its default.
import { readWidgetStyle, type WidgetStyle, type readHexColor, type readWholeNumber } from '@/lib/widgetStyle'

export type StyleTools = { readWidgetStyle: typeof readWidgetStyle; readHexColor: typeof readHexColor; readWholeNumber: typeof readWholeNumber }

export function parseStyleFromForm({ formData, tools }: { formData: FormData; tools: StyleTools }): WidgetStyle {
  // A missing field reads as the text "null", which is neither a colour nor a number, so it becomes the default.
  return tools.readWidgetStyle({
    values: {
      themeColor: String(formData.get('style-themeColor')),
      backgroundColor: String(formData.get('style-backgroundColor')),
      cornerRadius: String(formData.get('style-cornerRadius')),
      priceSize: String(formData.get('style-priceSize')),
    },
    tools,
  })
}
