// Ordered oldest -> newest. Add an entry here when shipping a version worth
// telling users about. Bullet text lives inline (en/es/fr) rather than in
// _locales/*/messages.json, since per-release changelog prose would otherwise
// accumulate there forever. A bullet may use **bold** for a lead-in label,
// e.g. "**Full keyboard navigation**: operate tables without a mouse."
// Category labels (New features / Bug fixes / Improvements) are stable UI
// chrome and still come from messages.json via CHANGELOG_CATEGORIES.
export const CHANGELOG_CATEGORIES = {
  newFeatures: 'changelog_categoryNewFeatures',
  bugFixes: 'changelog_categoryBugFixes',
  improvements: 'changelog_categoryImprovements',
};

export const CHANGELOG_ENTRIES = [
  {
    version: '1.1.0',
    sections: [
      {
        category: 'newFeatures',
        items: [
          {
            en: '**Full keyboard navigation**: operate tables, charts, menus, dialogs, and the date picker entirely without a mouse. Press Alt+Shift+C to open the popup from anywhere.',
            es: '**Navegación completa por teclado**: usa tablas, gráficos, menús, cuadros de diálogo y el selector de fecha sin necesidad del ratón. Pulsa Alt+Shift+C para abrir el popup desde cualquier lugar.',
            fr: '**Navigation complète au clavier** : utilisez les tableaux, graphiques, menus, boîtes de dialogue et le sélecteur de date entièrement sans souris. Appuyez sur Alt+Maj+C pour ouvrir le popup depuis n’importe où.',
          },
          {
            en: '**Screen reader support**: buttons, rule lists, forms, and notifications now announce themselves properly.',
            es: '**Compatibilidad con lectores de pantalla**: los botones, las listas de reglas, los formularios y las notificaciones ahora se anuncian correctamente.',
            fr: '**Prise en charge des lecteurs d’écran** : les boutons, listes de règles, formulaires et notifications s’annoncent désormais correctement.',
          },
          {
            en: '**Better color contrast**: text and controls in both themes now meet WCAG AA contrast guidelines.',
            es: '**Mejor contraste de color**: el texto y los controles en ambos temas ahora cumplen las pautas de contraste WCAG AA.',
            fr: '**Meilleur contraste des couleurs** : le texte et les contrôles des deux thèmes respectent désormais les directives de contraste WCAG AA.',
          },
          {
            en: '**Color-blind friendly charts**: apply a color-blind safe chart palette with one click in settings.',
            es: '**Gráficos aptos para daltónicos**: aplica una paleta de colores apta para daltónicos con un clic en la configuración.',
            fr: '**Graphiques adaptés au daltonisme** : appliquez une palette de couleurs adaptée au daltonisme en un clic dans les paramètres.',
          },
          {
            en: '**Custom chart colors**: pick your own color for each chart series with a new color picker in settings, complete with live preview and reset. Your colors apply across all chart pages and are included in backup export and import.',
            es: '**Colores de gráficos personalizados**: elige tu propio color para cada serie del gráfico con un nuevo selector de color en la configuración, con vista previa en vivo y opción de restablecer. Tus colores se aplican en todas las páginas de gráficos y se incluyen en la exportación e importación de copias de seguridad.',
            fr: '**Couleurs de graphiques personnalisées** : choisissez votre propre couleur pour chaque série de graphique avec un nouveau sélecteur de couleur dans les paramètres, avec aperçu en direct et réinitialisation. Vos couleurs s’appliquent sur toutes les pages de graphiques et sont incluses dans l’export et l’import de sauvegarde.',
          },
        ],
      },
      {
        category: 'bugFixes',
        items: [
          {
            en: 'Some links could not be reached with the keyboard.',
            es: 'Algunos enlaces no se podían alcanzar con el teclado.',
            fr: 'Certains liens n’étaient pas accessibles au clavier.',
          },
          {
            en: 'Clicking a chart bar no longer leaves a keyboard focus ring behind.',
            es: 'Al hacer clic en una barra del gráfico ya no queda un anillo de foco de teclado.',
            fr: 'Cliquer sur une barre de graphique ne laisse plus d’anneau de focus clavier.',
          },
          {
            en: 'Clicking the add-rule button while the form is open now closes it.',
            es: 'Al hacer clic en el botón de añadir regla mientras el formulario está abierto, ahora este se cierra.',
            fr: 'Cliquer sur le bouton d’ajout de règle pendant que le formulaire est ouvert le referme désormais.',
          },
        ],
      },
    ],
  },
];
