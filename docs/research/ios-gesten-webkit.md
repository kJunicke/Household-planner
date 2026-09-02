# Zieh-Gesten auf iOS Safari / WebKit — was die Quellen wirklich sagen

Recherche vom 2026-09-02. Anlass: Abreißen am Eselsohr (`useTearGesture`) und
Long-Press mit Richtungswahl (`useDirectionPress`) funktionieren auf Android
Chrome, auf dem iPhone nicht. Vier Korrekturen wurden ausgeliefert, hergeleitet
aus Symptomen. Dieses Dokument prüft sie gegen Primärquellen.

**Benutzte Quellenarten:**

* **W3C-Spezifikationen** (Editor's Drafts): Pointer Events Level 3, Touch
  Events, CSSOM View Module Level 1, CSS Overscroll Behavior Module Level 1.
* **WebKit-Quellcode**, per `raw.githubusercontent.com` vom Branch `main`
  abgerufen (Stand 2026-09-02). Alle Zitate sind wörtlich aus den genannten
  Dateien.
* **WebKit Bugzilla** (`bugs.webkit.org`), offene und geschlossene Tickets;
  Status und Resolution jeweils über `show_bug.cgi?ctype=xml&id=…` verifiziert.
* **WebKit-Blog** (`webkit.org/blog/…`) und **Apple Developer Documentation**
  (inkl. der archivierten „Safari Web Content Guide").

**Nicht benutzt:** Blogposts Dritter, StackOverflow, Tutorials. Wo eine
Behauptung nur dort steht, ist das im Text als Befund vermerkt. MDN wurde nicht
als Beleg herangezogen; alle Versionsangaben stammen aus WebKit-Blog bzw.
Bugzilla.

---

## Urteilstabelle

| # | Unsere Annahme | Urteil |
|:--|:---------------|:-------|
| 1 | `useScrollQuiet` filtert über Positionsdelta, weil WebKit `scroll` **ohne Positionsänderung** feuert (Gummiband, Viewport, Rundung) | **WIDERLEGT in der Begründung**, Maßnahme selbst harmlos. WebKit meldet die Gummiband-Position **ungeklemmt** an das DOM — das Gummiband erzeugt echte, große Deltas. Der 2-px-Filter fängt es nicht. |
| 2 | Nicht-passiver `touchmove` mit `preventDefault()` zusätzlich zu `touch-action: none`, weil WebKit sich an `touch-action` nicht hält | **TEILWEISE.** `touch-action` ist seit iOS 13 implementiert und wird respektiert — aber es gibt offene Bugs, in denen ein WebKit-Entwickler wörtlich sagt, `touch-action: none` greife während Momentum-Scrolling nicht. **Neuer Befund:** `preventDefault()` hat auf iOS eine **Frist**; nach Beginn der Pan-Geste ist es wirkungslos. |
| 3 | `touch-action: none` **dauerhaft** statt dynamischem Wechsel | **BESTÄTIGT**, doppelt belegt: normativ in Pointer Events L3 und im WebKit-Quellcode (Auswertung genau einmal, beim `touchstart`, danach eingefroren). |
| 4 | `overscroll-behavior-y: contain` auf `html, body` unterdrückt das Gummiband | **WIDERLEGT, zweifach.** `contain` darf das Gummiband laut Spezifikation ausdrücklich **nicht** anfassen — und WebKit schaltet `UIScrollView.bounces` nachweislich nur bei `none` ab. Die Zeile auf `body` ist außerdem **wirkungslos**: WebKit liest den Viewport-Wert allein vom `documentElement`. Der Kommentar in `base.css` steht verkehrt herum. |
| 5 | Pointer Events sind auf WebKit die empfohlene Grundlage für Drag-Gesten | **TEILWEISE.** WebKit empfiehlt Pointer Events — aber nur im Zusammenhang mit Maus/Trackpad auf iPadOS. Für das Abbestellen des Bildlaufs bleiben Touch-Ereignisse der einzige Weg. |
| 6 | Der explizite `setPointerCapture()`-Aufruf wird gebraucht | **WIDERLEGT für Touch.** Spec *und* WebKit-Quellcode: der Zeiger ist beim `pointerdown` bereits implizit eingefangen. Dazu ein offener iOS-Bug, der den expliziten Aufruf sogar schädlich macht. |
| 7 | Der Touch-Rückfallweg nach `pointercancel` ist die anerkannte Lösung | **BESTÄTIGT als passend zur WebKit-Implementierung.** WebKit bricht beim Scroll-Beginn ausdrücklich nur die **Zeiger** ab, nicht die UIKit-Touches — die Touch-Ereignisse laufen also wirklich weiter. Eine „anerkannte Lösung" ist nirgends dokumentiert. |
| 8 | Standalone-PWA scrollt nachweislich anders als der Safari-Tab | **BESTÄTIGT**, über zwei Bugzilla-Tickets. Apple dokumentiert den Unterschied nirgends. |
| 9 | Systemgesten am Bildschirmrand lassen sich beeinflussen | **WIDERLEGT.** Offener WebKit-Bug: `touch-action: none` verhindert die Seitenwechsel-Gesten auf iOS nicht. Kein Web-API dafür. |
| 10 | Es gibt eine empfohlene Gesamtarchitektur von WebKit/Apple | **DOKUMENTATION SCHWEIGT.** Einzige Anleitung ist ein archiviertes Rezept von 2016. |

---

## 1. Der Scroll-Wächter und das Gummiband

### Was die Spezifikation sagt — und was sie nicht sagt

CSSOM View kennt nur einen Auslöser: „Whenever a viewport gets scrolled (whether
in response to user interaction or by an API), the user agent must run these
steps: … Append (doc, "scroll") to doc's pending scroll events."
Quelle: <https://drafts.csswg.org/cssom-view-1/#scrolling-events>

Ob **elastischer Overscroll** ein „gets scrolled" im Sinne dieser Regel ist,
sagt die Spezifikation nicht. → **DOKUMENTATION SCHWEIGT.** Ein Ereignis ohne
Positionsänderung ist ebenfalls nicht vorgesehen, aber auch nicht verboten.

Ein Detail, das unsere Annahmenliste betrifft: Bildläufe des **visuellen**
Viewports (Adressleiste, Pinch-Zoom) werden laut Spezifikation nicht am `window`
zugestellt, sondern am `VisualViewport`-Objekt: „Whenever a visual viewport gets
scrolled … Append (vv, "scroll") to doc's pending scroll events", mit `vv` als
`VisualViewport`. Ebenso wird `resize` bei Änderung von `scale`/`width`/`height`
**am VisualViewport** gefeuert.
Quelle: <https://drafts.csswg.org/cssom-view-1/#scrolling-events>,
<https://drafts.csswg.org/cssom-view-1/#resizing-viewports>

Der Zuhörer in `useScrollQuiet` hängt am `window`. Der in der Datei genannte
Grund „Ein- und Ausfahren der Adressleiste und jede Änderung des visuellen
Viewports" trifft ihn also nach Spezifikation gar nicht.

### Was der WebKit-Quellcode sagt: das Gummiband ist ein echter Bildlauf

Auf iOS scrollt die `UIScrollView` im UI-Prozess. WebKit erkennt das Gummiband
daran, dass der `contentOffset` **außerhalb** des gültigen Bereichs liegt:

```objc
- (BOOL)_scrollViewIsRubberBanding:(UIScrollView *)scrollView
{
    CGPoint contentOffset = [scrollView contentOffset];
    CGPoint boundedOffset = contentOffsetBoundedInValidRange(scrollView, contentOffset);
    return !pointsEqualInDevicePixels(contentOffset, boundedOffset, deviceScaleFactor);
}
```
`Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm>

Diese ungeklemmte Position wird an den Web-Prozess geschickt
(`WebPage::updateVisibleContentRects`, `auto scrollPosition =
roundedIntPoint(unobscuredContentRect.location());`) und dort **ausdrücklich
ohne Klemmung** in den Frame übernommen:

```cpp
    frameView.setScrollClamping(ScrollClamping::Unclamped);
    frameView.notifyScrollPositionChanged(roundedIntPoint(scrollPosition));
    frameView.setScrollClamping(ScrollClamping::Clamped);
```
`Source/WebCore/page/scrolling/AsyncScrollingCoordinator.cpp`,
`AsyncScrollingCoordinator::reconcileScrollingState`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/scrolling/AsyncScrollingCoordinator.cpp>

Und jede so gemeldete Positionsänderung erzeugt ein DOM-`scroll`-Ereignis:

```cpp
void LocalFrameView::scrollPositionChanged(const ScrollPosition& oldPosition, const ScrollPosition& newPosition)
{
    …
    if (throttlingDelay == 0_s) {
        m_delayedScrollEventTimer.stop();
        scheduleScrollEvent();
    } else if (!m_delayedScrollEventTimer.isActive())
        m_delayedScrollEventTimer.startOneShot(throttlingDelay);
```
`Source/WebCore/page/LocalFrameView.cpp`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp>

**Daraus folgt dreierlei:**

1. **`window.scrollY` ist während des Gummibands nicht geklemmt.** Es nimmt
   negative Werte (oben) bzw. Werte über dem Maximum (unten) an.
2. **Das Gummiband feuert echte `scroll`-Ereignisse mit echtem Delta** — beim
   Federn über zig Pixel. Der Schwellwert `SCROLL_MIN_DELTA = 2` filtert es
   folglich **nicht**. Die in `useScrollQuiet.ts` notierte Begründung
   („WebKit feuert `scroll` auch dann, wenn sich nichts bewegt hat") ist für den
   Fall Gummiband **falsch**.
3. **Sub-Pixel-Rundung als Rauschquelle scheidet aus**: WebKit rundet die
   Position vor der Meldung (`roundedIntPoint`). Zwei aufeinanderfolgende
   Ereignisse ohne ganzzahlige Änderung entstehen auf diesem Weg nicht.

### Zwei Bugzilla-Tickets, die beides ausdrücklich bestätigen

Beide von Simon Fraser, dem Scrolling-Verantwortlichen bei WebKit, beide seit
2019-06-06 **NEW** und bis heute nicht behoben:

* Bug 198597 — „**Don't expose negative scrollLeft/scrollTop during
  rubber-banding**". Der Patch ist bewusst nie gelandet; Simon Fraser dazu: „I'm
  worried that this isn't web compatible, so I'll hold off on landing this."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=198597>
* Bug 198598 — „**Don't fire scroll events during rubber-banding, when the
  observable values of scrollLeft and scrollTop are not changing**". Aus dem
  Ticket, Simon Fraser: „There are many websites that do the wrong thing with
  negative offsets … I don't think the negative values are web-compatible."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=198598>

Der Titel von 198598 sagt es in aller Deutlichkeit: dass während des Gummibands
Ereignisse feuern, ist Ist-Zustand; abgeschafft werden soll nur der Teilfall
**ohne** Wertänderung. Und laut 198597 ändern sich die Werte sehr wohl —
sie werden negativ.

Ob WebKit darüber hinaus `scroll` am `window` mit Delta null feuert, ließ sich
nicht belegen. → **DOKUMENTATION SCHWEIGT.** Der Filter ist insofern harmlos,
aber er behebt nicht das, was er beheben soll.

**Eine halbe Rettung für die Sub-Pixel-These**, allerdings am falschen Objekt:
Bug 226354 — „VisualViewport fires lots scroll events for 0.5px offsets when
scrolling on Retina iOS device", **NEW** seit 2021.
Quelle: <https://bugs.webkit.org/show_bug.cgi?id=226354>
Das betrifft den `VisualViewport`, an dem `useScrollQuiet` gar nicht lauscht.

### Der brauchbare Filter steht in derselben Quelle

Weil WebKit die Gummiband-Position **ungeklemmt** durchreicht, ist das Gummiband
in JavaScript direkt erkennbar: `window.scrollY < 0` oder
`window.scrollY > document.documentElement.scrollHeight - window.innerHeight`.
Das ist kein Rundungsrauschen, sondern ein eindeutiges Signal. Empfehlung dazu
unten.

### `scrollend` als Ersatz für den 300-ms-Nachlauf?

Erst ab **Safari 26.2**: „Safari 26.2 adds support for the `scrollend` event,
which fires once when scrolling definitively completes. … Previously, developers
had to debounce the scroll event with timers to detect when scrolling stopped,
which was imprecise and required guessing at appropriate delay values."
Quelle: <https://webkit.org/blog/17640/webkit-features-for-safari-26-2/>

Für unser Zielpublikum zu neu. Der Nachlauf bleibt.

---

## 2. Nicht-passiver `touchmove` mit `preventDefault()`

### Die Annahme „WebKit hält sich nicht an `touch-action`" ist so nicht haltbar

`touch-action` ist auf iOS implementiert, und zwar vollständig durchgesetzt seit
Januar 2019:

* Bug 193447 — „Limit user-agent interactions based on the touch-action property
  on iOS", **RESOLVED / FIXED**.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=193447>
* Antoine Quint im Sammelticket Bug 133112 („Touch-action css property
  support"), 2019-10-03, wörtlich: „touch-action: pan-y is supported in Safari on
  iOS 13."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=133112>

Der Durchsetzungsweg ist im Quellcode sichtbar: Aus dem beim `touchstart`
ermittelten `touch-action` werden zwei Flaggen abgeleitet, und UIKit bekommt
gesagt, in welcher Achse die Pan-Geste nichts bewirken darf:

```objc
- (UIAxis)axesToPreventScrollingForPanGestureInScrollView:(WKBaseScrollView *)scrollView
{
    …
    UIAxis axesToPrevent = UIAxisNeither;
    if ([_contentView preventsPanningInXAxis])
        axesToPrevent |= UIAxisHorizontal;
    if ([_contentView preventsPanningInYAxis])
        axesToPrevent |= UIAxisVertical;
```
`Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm>

### Aber es gibt belegte Löcher

* **Momentum-Scrolling.** Bug 198708, „touch-action:pan-x/y is not respected
  during momentum scrolling", **NEW** seit 2019-06-10. Kommentar von Antti
  Koivisto, wörtlich: „This is true touch-action:none too. It is more noticeable
  with pan-x/y since you can use it to break out of the limitation easily."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=198708>
  → In eine fliegende Wand zu greifen, hebelt `touch-action: none` aus. Der
  Riegel am `pointerdown` in `useTearGesture` ist damit **tragend**, nicht bloß
  Komfort.
* **Verschachtelte Hierarchien.** Bug 194814, „[iOS] Correctly handle nested
  elements in hierarchies with a touch-action property", **NEW** seit 2019,
  gemeldet von Antoine Quint selbst: „does not account for various elements
  within a hierarchy having different touch-action values."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=194814>
* **Systemgesten.** Bug 239416, „‚touch-action: none' does not prevent page
  change gestures", **NEW**.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=239416>
* **Stiller Rückfall auf `auto`.** Der `touch-action`-Wert wird auf iOS nicht am
  DOM ermittelt, sondern im UI-Prozess durch einen Treffertest gegen die aus
  dem Web-Prozess replizierte Event-Region. Fehlt die Region, ist das Ergebnis
  ohne Fehlermeldung `Auto`:

  ```objc
      // We only hit WKChildScrollView directly if its content layer doesn't have an event region.
      // We don't generate the region if there is nothing interesting in it, meaning the touch-action is auto.
      if ([view isKindOfClass:[WKChildScrollView class]])
          return WebCore::TouchAction::Auto;
      …
      RefPtr node = RemoteLayerTreeNode::forCALayer(hitView.get().layer);
      if (!node)
          return { WebCore::TouchAction::Auto };
  ```
  `Source/WebKit/UIProcess/RemoteLayerTree/ios/RemoteLayerTreeViews.mm`,
  `touchActionsForPoint`
  Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/RemoteLayerTree/ios/RemoteLayerTreeViews.mm>

**Zwischenurteil:** Der Gürtel-und-Hosenträger-Ansatz ist gerechtfertigt. Die
Begründung in `useTearGesture.ts` („WebKit hält sich nicht zuverlässig an
`touch-action`") sollte aber präzisiert werden — sie ist pauschal falsch und in
den vier genannten Sonderfällen richtig.

### Der neue, wichtigere Befund: `preventDefault()` hat eine Frist

Apple dokumentiert `preventDefault()` auf `touchmove` als den vorgesehenen Weg:

> „The default behavior of Safari on iOS can interfere with your application's
> custom multi-touch and gesture input. You can disable the default browser
> behavior by sending the `preventDefault` message to the event object."

Quelle: <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html>
(archivierte Fassung; dieselbe Seite warnt: „The default browser behavior may
change in future releases.")

Die Touch-Events-Spezifikation setzt aber eine Grenze:

> „A user agent should suppress the default action caused by any touchmove event
> until at least one touchmove event associated with the same active touch point
> is not canceled. **Whether the default action is suppressed for touchmove
> events after at least one touchmove event associated with the same active
> touch point is not canceled is implementation dependent.**"

Quelle: <https://w3c.github.io/touch-events/#the-touchmove-event>

Und WebKit implementiert genau die strenge Lesart. Sobald die Pan-Geste der
`UIScrollView` zu ziehen beginnt, wird die Fähigkeit der Touch-Ereignisse,
native Gesten zu verhindern, abgeschaltet:

```objc
- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView
{
    …
    if (scrollView.panGestureRecognizer.state == UIGestureRecognizerStateBegan)
        [_contentView scrollViewWillStartPanOrPinchGesture];
```
```objc
- (void)scrollViewWillStartPanOrPinchGesture
{
    …
    _touchEventsCanPreventNativeGestures = NO;
}
```
`Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm` bzw.
`Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm`
Quellen:
<https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm>,
<https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm>

Danach werden die Touch-Ereignisse als *unpreventable* verschickt
(`_page->handleUnpreventableTouchEvent(nativeWebTouchEvent)`), und
`event.cancelable` ist `false`.

**Konsequenz für unseren Code:**

* `useTearGesture.onTouchMove` bestellt **ab der ersten Bewegung** ab. Das ist
  richtig, und die Begründung im Kommentar der Datei („ein begonnener Bildlauf
  lässt sich nicht mehr abbestellen") ist durch obigen Quellcode **bestätigt**.
* `useDirectionPress.onTouchMove` bestellt **erst nach dem Auslösen** ab
  (`if (!open.value) return`). Das geht nur auf, solange der Finger bis dahin
  still lag — genau die Annahme, die der Kommentar in der Datei macht, und die
  hier ebenfalls **bestätigt** wird. Der Preis ist real und muss so bleiben: ein
  `touch-action: none` über die ganze Zettelfläche wäre die Alternative und
  würde die Wand unscrollbar machen.

---

## 3. `touch-action: none` dauerhaft statt dynamisch

**BESTÄTIGT, zweifach.**

Normativ, Pointer Events Level 3:

> „Once panning or zooming has been started, and the user agent has already
> determined whether or not the gesture should be handled as a user agent direct
> manipulation behavior, **any changes to the relevant touch-action value will be
> ignored for the duration of the action.** For instance, programmatically
> changing the touch-action value for an element from auto to none as part of a
> pointerdown handler script will not result in the user agent aborting or
> suppressing any of the pan or zoom behavior for that input for as long as that
> pointer is active."

Quelle: <https://w3c.github.io/pointerevents/#determining-supported-direct-manipulation-behavior>

In WebKit ist das nicht bloß erlaubt, sondern gebaut: der Wert wird **genau
einmal**, in der Phase `Pressed` (also beim `touchstart`), per Treffertest
ermittelt und pro `Touch.identifier` eingefroren:

```objc
    for (const auto& touchPoint : touchEvent.touchPoints()) {
        auto phase = touchPoint.phase();
        if (phase == WebKit::WebPlatformTouchPoint::State::Pressed) {
            auto touchActions = WebKit::touchActionsForPoint(self, WebCore::roundedIntPoint(touchPoint.locationInRootView()));
            …
            [_touchActionGestureRecognizer setTouchActions:touchActions forTouchIdentifier:touchPoint.identifier()];
            scrollingCoordinator->setTouchActionsForTouchIdentifier(touchActions, touchPoint.identifier());
            _preventsPanningInXAxis = !touchActions.containsAny({ WebCore::TouchAction::PanX, WebCore::TouchAction::Manipulation });
            _preventsPanningInYAxis = !touchActions.containsAny({ WebCore::TouchAction::PanY, WebCore::TouchAction::Manipulation });
        } else if (phase == WebKit::WebPlatformTouchPoint::State::Released || phase == WebKit::WebPlatformTouchPoint::State::Cancelled) {
            [_touchActionGestureRecognizer clearTouchActionsForTouchIdentifier:touchPoint.identifier()];
            scrollingCoordinator->clearTouchActionsForTouchIdentifier(touchPoint.identifier());
        }
    }
```
`Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm`,
`-_handleTouchActionsForTouchEvent:`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm>

Die Phase `Change` (`touchmove`) fällt durch beide Zweige: **keine
Neubewertung.**

**Präzisierung zum Kommentar in `WallNote.vue`.** Der dort beschriebene
`.ear--locked`-Wechsel auf `pan-y` war nicht wirkungslos — er hätte für die
**nächste** Berührung gegolten, nicht für die laufende. Die Rückkopplung, die
der Kommentar beschreibt, ist damit sogar plausibler als angenommen: jede neue
Berührung während des Nachlaufs hätte wieder `pan-y` gesehen. Der Rückbau war
richtig; die Begründung „eine Änderung mitten in der Geste wirkt nicht" ist
zusätzlich richtig, betraf aber nicht den Fehler.

**Unterschied zu Blink/Chrome:** Beide Engines implementieren dieselbe
normative Regel, und ein primärquellenbelegter Verhaltensunterschied ließ sich
nicht finden. → **DOKUMENTATION SCHWEIGT.**

**Ein weiterer Quellcode-Befund zur Achsen-Granularität**, direkt aus dem
Kommentar in WebKit:

> „Panning is only allowed if ‚pan-x', ‚pan-y' or ‚manipulation' is specified.
> **Additional work is needed to respect individual values**, but this takes care
> of the case where no panning is allowed."

`Source/WebKit/UIProcess/ios/WKTouchActionGestureRecognizer.mm`,
`-canPreventGestureRecognizer:`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKTouchActionGestureRecognizer.mm>

Auf iOS ist also der Fall „gar kein Panning" (`none`) sauber umgesetzt, die
Achsenwerte sind es nicht. Wer auf iOS verlässlich unterdrücken will, nimmt
`none` — nicht `pan-y`. Das stützt den Rückbau ein zweites Mal.

---

## 4. `overscroll-behavior-y: contain` — die Maßnahme trifft nicht ihr Ziel

Dies ist der klarste Widerspruch dieser Recherche.

Die Spezifikation unterscheidet **lokale** und **nicht-lokale** Randaktionen:

> „A **local boundary default action** is a boundary default action which is
> performed on the scroll container without interacting with the page, for
> example displaying a overscroll UI affordance. Conversely, a **non-local
> boundary default action** interacts with the page, for example scroll chaining
> or a navigation action."

Und dann, zu den Werten:

> **contain** — „This value indicates that the element must not perform
> non-local boundary default actions such as scroll chaining or navigation. …
> **This value must not modify the behavior of how local boundary default actions
> should behave, such as showing any overscroll affordances.**"
>
> **none** — „This value implies the same behavior as contain and in addition
> **this element must also not perform local boundary default actions such as
> showing any overscroll affordances.**"

Quelle: <https://drafts.csswg.org/css-overscroll-behavior-1/#overscroll-behavior-properties>

Das Gummiband **ist** die „overscroll affordance". `contain` darf sie
ausdrücklich nicht abschalten. Die Spezifikation sagt das an anderer Stelle noch
einmal in ihren Beispielen: für einen Infinite Scroller, der „the potentially
confusing rubber banding effect" loswerden will, schreibt sie
`overscroll-behavior-y: none` vor.
Quelle: <https://drafts.csswg.org/css-overscroll-behavior-1/#motivating-examples>

**Der Kommentar in `base.css` steht damit genau verkehrt herum.** Dort steht:
„`contain` statt `none`: Wischen zum Neuladen (Android) und die Zurueck-Geste
bleiben unangetastet, nur der Ueberhang entfaellt." Richtig ist das Gegenteil:
`contain` schaltet Verkettung und **Navigation** ab (die Spec nennt
Pull-to-Refresh in ihrem Beispiel ausdrücklich als das, was `contain` auf `html`
unterbindet) und lässt den Überhang stehen.

### Der WebKit-Quellcode bestätigt es auf iOS wörtlich

Auf iOS wird `overscroll-behavior` in genau eine UIKit-Eigenschaft übersetzt —
und zwar **nur beim Wert `none`**:

```objc
void ScrollingTreeScrollingNodeDelegateIOS::updateScrollViewForOverscrollBehavior(UIScrollView *scrollView, const WebCore::OverscrollBehavior horizontalOverscrollBehavior, WebCore::OverscrollBehavior verticalOverscrollBehavior, AllowOverscrollToPreventScrollPropagation allowPropogation)
{
    if (RetainPtr wkScrollView = dynamic_objc_cast<WKScrollView>(scrollView))
        [wkScrollView _setBouncesInternal:horizontalOverscrollBehavior != WebCore::OverscrollBehavior::None vertical: verticalOverscrollBehavior != WebCore::OverscrollBehavior::None];
    else {
        scrollView.bouncesHorizontally = horizontalOverscrollBehavior != OverscrollBehavior::None;
        scrollView.bouncesVertically = verticalOverscrollBehavior != OverscrollBehavior::None;
    }
    if (allowPropogation == AllowOverscrollToPreventScrollPropagation::Yes) {
        [scrollView _wk_setTransfersHorizontalScrollingToParent:horizontalOverscrollBehavior == OverscrollBehavior::Auto];
        [scrollView _wk_setTransfersVerticalScrollingToParent:verticalOverscrollBehavior == OverscrollBehavior::Auto];
    }
}
```
`Source/WebKit/UIProcess/RemoteLayerTree/ios/ScrollingTreeScrollingNodeDelegateIOS.mm`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/RemoteLayerTree/ios/ScrollingTreeScrollingNodeDelegateIOS.mm>

`bounces` **ist** das Gummiband. Mit `contain` bleibt es an; nur `none` schaltet
es aus. Dieselbe Funktion wird für den Haupt-Scroller aufgerufen:

```objc
    auto horizontalOverscrollBehavior = scrollingCoordinator->mainFrameHorizontalOverscrollBehavior();
    auto verticalOverscrollBehavior = scrollingCoordinator->mainFrameVerticalOverscrollBehavior();

    WebKit::ScrollingTreeScrollingNodeDelegateIOS::updateScrollViewForOverscrollBehavior(_scrollView.get(), horizontalOverscrollBehavior, verticalOverscrollBehavior, WebKit::ScrollingTreeScrollingNodeDelegateIOS::AllowOverscrollToPreventScrollPropagation::No);
```
`Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm>

Die zugehörigen Tickets, beide **RESOLVED / FIXED**:
Bug 233788 „Implement CSS overscroll-behavior for iOS" (2021-12-03) und
Bug 237696 „[iOS] Fix overscroll-behavior for main document" (2022-03-10), dort
wörtlich in der Beschreibung: „Make overscroll-behavior on html element work for
iOS."
Quellen: <https://bugs.webkit.org/show_bug.cgi?id=233788>,
<https://bugs.webkit.org/show_bug.cgi?id=237696>

WebKit implementiert die Eigenschaft mit `contain`, `none`, `auto`
(`Source/WebCore/css/CSSProperties.json`, `settings-flag:
overscrollBehaviorEnabled`).
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/CSSProperties.json>

**Verfügbarkeit in Safari:** angekündigt mit Safari 16.0 — „CSS Overscroll
Behavior determines what happens when a user scrolls and reaches the boundary of
a scrolling area. It's useful when you want to stop scroll chaining".
Quelle: <https://webkit.org/blog/13152/webkit-features-in-safari-16-0/>

Aber der für uns entscheidende Wert war bis 16.4 kaputt: „Fixed
`overscroll-behavior: none` to prevent overscroll when the page is too small to
scroll."
Quelle: <https://webkit.org/blog/13966/webkit-features-in-safari-16-4/>
Das ist genau unser Fall — eine kurze Wand, die gar nicht scrollen kann und
trotzdem federt. Praktische Mindestversion: **Safari 16.4**.

**`html` oder `body`?** Die Eigenschaft gilt laut Spec „Applies to: scroll
container elements", und „The viewport participates in scroll chaining as the
document's `scrollingElement`". Eine Propagationsregel von `body` auf den
Viewport — wie sie `overflow` und `background` kennen — **gibt es für
`overscroll-behavior` nicht**; im Motivationsbeispiel setzt die Spec sie auf
`html` („the viewport defining element").
Quelle: <https://drafts.csswg.org/css-overscroll-behavior-1/#overscroll-behavior-properties>

**Und WebKit liest den Wert ausschließlich vom `documentElement`:**

```cpp
OverscrollBehavior LocalFrameView::horizontalOverscrollBehavior() const
{
    auto* document = m_frame->document();
    auto* scrollingObject = document && document->documentElement() ? document->documentElement()->renderer() : nullptr;
    if (scrollingObject && renderView())
        return scrollingObject->style().overscrollBehaviorX();
    return OverscrollBehavior::Auto;
}
```
`Source/WebCore/page/LocalFrameView.cpp` (`verticalOverscrollBehavior()` direkt
darunter, wortgleich mit `overscrollBehaviorY()`)
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp>

**Die `body`-Zeile in `base.css` ist damit nachweislich totes Holz.** Es gibt
keine Propagation von `body` auf den Viewport, weder in der Spezifikation noch
in WebKit. Die Begründung im Kommentar („weil nicht festgelegt ist, welches der
beiden der Browser als scrollendes Element behandelt") ist für diese Eigenschaft
gegenstandslos.

**Offene WebKit-Bugs, die die Verlässlichkeit einschränken** (alle Status
**NEW**, verifiziert):

| Bug | Titel |
|:--|:--|
| [243452](https://bugs.webkit.org/show_bug.cgi?id=243452) | „Overscroll Behavior not respecting elements with no overflowing content" |
| [301838](https://bugs.webkit.org/show_bug.cgi?id=301838) | „overscroll-behavior not applied on elements with `transform: translateZ(0)`" |
| [240235](https://bugs.webkit.org/show_bug.cgi?id=240235) | „overscroll-behavior: none doesn't prevent rubberbanding reliably in scroll-snap containers" |
| [240183](https://bugs.webkit.org/show_bug.cgi?id=240183) | „CSS overscroll-behavior-x: contain does not disable history navigation" |
| [258593](https://bugs.webkit.org/show_bug.cgi?id=258593) | „Keyboard scrolling ignores `overscroll-behavior` for rubberbanding" |
| [275947](https://bugs.webkit.org/show_bug.cgi?id=275947) | „overscroll-behavior:none or overscroll-behavior:contain doesn't disable pull to refresh" (gemeldet für iOS 16) |

Bug 301838 ist für uns interessant, weil `.zettel` `will-change: transform`
trägt — dieselbe Klasse von „eigener Compositing-Layer". Der Bug betrifft
`overscroll-behavior`, nicht `touch-action`; eine Übertragung wäre eine
**Vermutung**, kein Beleg.

---

## 5. Pointer Events oder Touch Events auf WebKit?

Die einzige gefundene Empfehlung von WebKit selbst steht im Safari-13.1-Post und
handelt von Maus und Trackpad auf iPadOS:

> „The latest iPadOS 13.4 brings desktop-class pointer and mouse event support to
> Safari and WebKit. To ensure the best experience, web developers can use
> feature detection and adopt Pointer Events. Since a mouse or trackpad won't
> send touch events, web content should not depend on touch events. Pointer
> Events will specify whether a mouse/trackpad or touch generated the event."

Quelle: <https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/>

Der Safari-13-Post kündigt Pointer Events an, ohne eine Empfehlung
auszusprechen.
Quelle: <https://webkit.org/blog/9674/new-webkit-features-in-safari-13/>

Einen WebKit-Text, der Pointer Events **für Drag-Gesten auf dem Telefon** als
Grundlage empfiehlt, gibt es nicht. → **DOKUMENTATION SCHWEIGT.**

Was dagegen feststeht: Pointer Events haben **keinen** Mechanismus, um den
Bildlauf abzubestellen. Die Overscroll-Spezifikation begründet ihre eigene
Existenz genau damit, dass Autoren sonst „event listeners without the passive
flag" installieren und `preventDefault()` rufen müssen.
Quelle: <https://drafts.csswg.org/css-overscroll-behavior-1/#intro>
Unser hybrider Aufbau — Pointer Events für die Logik, Touch Events nur zum
Abbestellen — ist damit nicht Notlösung, sondern die einzige mögliche Bauweise.

---

## 6. `setPointerCapture` — der explizite Aufruf ist für Touch überflüssig

**Spezifikation, normativ:**

> „If the event is `pointerdown`, the associated device is a direct manipulation
> device, and the target is an `Element`, then set pointer capture for this
> `pointerId` to the target element as described in implicit pointer capture."

und

> „Inputs that implement direct manipulation interactions for panning and zooming
> (such as touch or stylus on a touchscreen) SHOULD behave exactly as if
> `Element.setPointerCapture` was called on the target element just before the
> invocation of any `pointerdown` listeners."

Quellen: <https://w3c.github.io/pointerevents/#firing-events-using-the-pointerevent-interface>,
<https://w3c.github.io/pointerevents/#implicit-pointer-capture>

**WebKit tut genau das**, im Web-Prozess, beim `pointerdown`:

```cpp
    if (event.pointerType() == touchPointerEventType() && isPointerdown) {
        // https://w3c.github.io/pointerevents/#implicit-pointer-capture
        …
        setPointerCapture(&element, event.pointerId());
    }
```
`Source/WebCore/page/PointerCaptureController.cpp`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/PointerCaptureController.cpp>

**Damit ist der Aufruf in `useTearGesture` und `useDirectionPress` für
Touch-Zeiger überflüssig.** Schlimmer: es gibt einen offenen iOS-Bug, der genau
diesen expliziten Aufruf betrifft:

* Bug 276287 — „First PointerMove event after setPointerCapture is not
  captured.", **NEW**, gemeldet 2024-07-06: „the first pointermove event after it
  will act as if it was not captured, before all following events function
  correctly."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=276287>

Weitere offene, aber für uns nachrangige Tickets: 219636 („setPointerCapture
breaks range inputs"), 221342, 232339, 233432, 236390 („iPad: PointerEvents stop
getting sent to WebView after a 5-finger gesture"), 195915.

**Nicht wegwerfen:** für `pointerType === 'mouse'` und `'pen'` gibt es keine
implizite Capture; dort bleibt der Aufruf nötig.

---

## 7. `pointercancel` — wann WebKit es feuert, und warum unser Rückfallweg passt

**Spezifikation.** Ein `pointercancel` ist Pflicht, wenn „The pointer is
subsequently used by the user agent to manipulate the page viewport (e.g.
panning or zooming)" — außerdem bei modalem Dialog/Menü, bei physischer Trennung
des Geräts und beim Start einer Drag-and-Drop-Operation. Optional bei
Bildschirmdrehung, zu vielen gleichzeitigen Zeigern und Handballenerkennung.
Danach folgen zwingend `pointerout`, `pointerleave` und die implizite Freigabe
der Capture.
Quelle: <https://w3c.github.io/pointerevents/#suppressing-a-pointer-event-stream>

**WebKit auf iOS.** Der Abbruch wird vom UI-Prozess ausgelöst, und zwar genau
dann, wenn die Pan- oder Pinch-Geste den Zeiger übernimmt:

```objc
    if (![_contentView preventsPanningInXAxis] && ![_contentView preventsPanningInYAxis]) {
        [_contentView cancelPointersForGestureRecognizer:panGestureRecognizer];
        return UIAxisNeither;
    }
    …
    if ((![_contentView preventsPanningInXAxis] && std::abs(translation.x) > CGFLOAT_EPSILON)
        || (![_contentView preventsPanningInYAxis] && std::abs(translation.y) > CGFLOAT_EPSILON))
        [_contentView cancelPointersForGestureRecognizer:panGestureRecognizer];
```
`Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm`,
`-axesToPreventScrollingForPanGestureInScrollView:`
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm>

`cancelPointersForGestureRecognizer:` ruft `WebPageProxy::cancelPointer` →
`PointerCaptureController::cancelPointer`.
Quelle: <https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm>

**Der entscheidende Punkt: das bricht die Zeiger ab, nicht die UIKit-Touches.**
Es wird kein `touchcancel` erzeugt; die Touch-Ereignisse laufen weiter, solange
der Finger liegt. Der Rückfallweg in `useDirectionPress` (nach `pointercancel`
auf `touchmove`/`touchend` am Fenster ausweichen) ist damit **kein Workaround
für etwas anderes**, sondern passt exakt zu dem, was WebKit tut. Eine
dokumentierte „anerkannte Lösung" dafür gibt es nirgends → **DOKUMENTATION
SCHWEIGT**; der Weg ist aber quellenseitig tragfähig.

**Zwei offene Bugs mit direkter Wirkung auf unseren Code:**

* Bug 194173 — „[iOS] pointercancel is not dispatched unless another pointer
  event type is registered", **NEW**: „it is necessary to listen to one of
  pointerdown, pointermove or pointerup for a pointercancel event to be
  dispatched." — Wir binden alle vier, also unkritisch; als Falle für die
  Zukunft notieren.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=194173>
* Bug 240917 — „pointercancel is not dispatched when `touch-action:
  manipulation`", **NEW**: mit `manipulation` kommt auf iOS gar kein
  `pointercancel`, mit der ausgeschriebenen Langform schon.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=240917>
  → `touch-action: manipulation` ist in dieser App verboten, solange
  `pointercancel` tragend ist.
* Bug 239014 — „[Pointer events] pointerend/pointercancel event never fired when
  swiping to forwards a page", **NEW**: beim Vorwärtswischen kommt nur ein
  `pointerdown` und danach nichts mehr.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=239014>
  → Genau die Sorte Sackgasse, gegen die der zweite Ausweg
  (`visibilitychange`) in `useDirectionPress` gebaut wurde. Diese Vorsorge ist
  belegt sinnvoll.

Ein systematischer Vergleich mit Chrome ließ sich aus Primärquellen nicht
führen. → **DOKUMENTATION SCHWEIGT.**

---

## 8. Homescreen-App (`display: standalone`) gegen Safari-Tab

Apple dokumentiert den standalone-Modus, sagt aber zum Scrollen nichts:

> „On iOS, as part of optimizing your web application, have it use the standalone
> mode to look more like a native application. When you use this standalone mode,
> Safari is not used to display the web content—specifically, there is no browser
> URL text field at the top of the screen or button bar at the bottom of the
> screen."

Quelle: <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html>

Ein Verhaltensunterschied beim Scrollen ist von Apple **nirgends** dokumentiert
→ **DOKUMENTATION SCHWEIGT**. In der Bugdatenbank ist er dagegen aktenkundig:

* Bug 220908 — „`<body>` with overflow:hidden CSS is scrollable on iOS standalone
  web app", **RESOLVED / FIXED**, gemeldet 2021-01-25, behoben mit
  `249864@main` am 2022-04-21. Aus dem Ticket: „Scroll on the body is not
  prevented when [..] in ‚standalone mode', i.e. when the web page is added to
  homescreen and no browser UI is displayed."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=220908>
* Bug 214781 — „Inconsistent scroll behavior when using overflow:hidden on body
  if added to home screen", **RESOLVED / DUPLICATE** von 220908. Kommentar eines
  WebKit-Entwicklers, wörtlich: „I do see that on the home screen, it's possible
  to rubber-band the body that reveal the red."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=214781>
* Bug 222654 — „Scrolling in home screen apps incorrectly latches to document",
  **NEW**, gemeldet 2021-03-03: „When using an app added to the home screen,
  scrolling incorrectly latches to #document, making it impossible for users to
  interact with the app." Kommentar: „the document is scrollable on home screen
  web apps when it should not be … UIKit has a bug where, if an ancestor scroll
  view is rubber banding, you have to wait for it to stop before you can scroll
  the inner scroll view".
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=222654>
* Bug 237961 — „Standalone with viewport-fit cover causes overscroll issues,
  breaks position fixed and -webkit-fill-available", **NEW** seit 2022-03-16:
  „Web apps in standalone mode with `viewport-fit=cover` suffer from overscroll
  issues and broken css/layout."
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=237961>
* Bug 218983 — „iOS: visualViewport.height unreliable in standalone PWA mode",
  **NEW**.
  Quelle: <https://bugs.webkit.org/show_bug.cgi?id=218983>

**Urteil: BESTÄTIGT.** Es gibt einen belegten, standalone-spezifischen
Unterschied, und er dreht sich ausgerechnet um Gummiband und Dokument-Scrolling.
Bug 222654 beschreibt außerdem genau das gemeldete Symptom „klappt manchmal,
meist nicht": solange die äußere Scroll-View federt, nimmt sie die Eingabe.

---

## 9. Systemgesten am Bildschirmrand

Kein Web-API. Bug 239416 („‚touch-action: none' does not prevent page change
gestures", **NEW**) hält fest, dass Android die Randgesten unter
`touch-action: none` unterbindet und iOS nicht.
Quelle: <https://bugs.webkit.org/show_bug.cgi?id=239416>

Verwandt, ebenfalls offen: Bug 233141 „macOS: ‚Pinch to tab overview' browser
gesture occasionally fires despite preventDefault()".
Quelle: <https://bugs.webkit.org/show_bug.cgi?id=233141>

Steuerbar ist das nur **nativ**, über `WKWebView`:
`allowsBackForwardNavigationGestures` — „A Boolean value that indicates whether
horizontal swipe gestures trigger backward and forward page navigation."
Quelle: <https://developer.apple.com/documentation/webkit/wkwebview/allowsbackforwardnavigationgestures>

Zu Control Center und Home-Indikator: für Web-Inhalte **DOKUMENTATION
SCHWEIGT.** Der einzige WebKit-Primärtext zum Bildschirmrand betrifft Layout,
nicht Gesten (`viewport-fit`, safe area).
Quelle: <https://webkit.org/blog/7929/designing-websites-for-iphone-x/>

**Praktische Folge für uns:** Das Eselsohr sitzt unten rechts am Zettel. Liegt
ein Zettel am rechten oder unteren Bildschirmrand, konkurriert der 44-px-Griff
mit der Zurück-Wisch- bzw. Home-Indikator-Zone, und diese Konkurrenz ist von
der Webseite aus nicht zu gewinnen.

---

## 10. Gibt es eine empfohlene Gesamtarchitektur?

**DOKUMENTATION SCHWEIGT.** Die einzige Anleitung von Apple ist ein Rezept aus
der archivierten „Safari Web Content Guide", das exakt unsere Achsenerkennung
beschreibt:

> „Begin gesture if you receive a touchstart event containing one target touch.
> Abort gesture if, at any time, you receive an event with >1 touches. Continue
> gesture if you receive a touchmove event mostly in the x-direction. Abort
> gesture if you receive a touchmove event mostly the y-direction. End gesture if
> you receive a touchend event."

Quelle: <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html>

Bemerkenswert: Apple beschreibt die Geste über **Touch-Ereignisse**, nicht über
Pointer Events, und kennt keine Zeiger-Capture. Es gibt keinen neueren Text, der
das ersetzt.

Ebenfalls aus dieser Seite, und ein Warnsignal für jede Scroll-Erkennung, die
sich auf `scroll`-Ereignisse verlässt:

> „One-finger panning doesn't generate any events until the user stops
> panning—an onscroll event is generated when the page stops moving and redraws"

Diese Beschreibung stammt aus der iOS-2-Ära und trifft auf heutiges WebKit
erkennbar nicht mehr zu (siehe Abschnitt 1); sie zeigt aber, dass es zu diesem
Thema **keine gepflegte Apple-Dokumentation** gibt.

---

## Was wir ändern sollten

### `src/assets/base.css`

1. **`contain` → `none`.** Wenn das Ziel ist, das Gummiband zu unterdrücken, ist
   `contain` laut Spezifikation der falsche Wert; er darf die Affordanz
   ausdrücklich nicht anfassen (§4.1). Setze `overscroll-behavior-y: none` auf
   `html`.
2. **Kommentar korrigieren.** Der Satz „`contain` statt `none`: Wischen zum
   Neuladen (Android) und die Zurueck-Geste bleiben unangetastet, nur der
   Ueberhang entfaellt" ist in beiden Hälften verkehrt. Richtig: `contain`
   unterbindet Verkettung und Navigation (also auch Pull-to-Refresh) und lässt
   den Überhang stehen; `none` nimmt zusätzlich den Überhang.
3. **`body` aus dem Selektor streichen.** WebKit liest den Viewport-Wert
   ausschließlich vom `documentElement` (`LocalFrameView::
   horizontalOverscrollBehavior`), und eine Propagation von `body` auf den
   Viewport gibt es für diese Eigenschaft weder in der Spezifikation noch im
   Code. Die Zeile ist wirkungslos; die Begründung im Kommentar („weil nicht
   festgelegt ist, welches der beiden der Browser als scrollendes Element
   behandelt") gilt für `overflow`, nicht für `overscroll-behavior`.
4. **Mindestversion notieren: Safari 16.4**, nicht 16.0 — davor greift `none`
   auf nicht scrollbaren Seiten nicht. Und: das ist eine Verbesserung, keine
   Garantie — Bug 275947, 243452 und 301838 sind offen.

### `src/composables/useScrollQuiet.ts`

5. **Den Kommentar zu `SCROLL_MIN_DELTA` richtigstellen.** Das Gummiband
   erzeugt echte, große Deltas (WebKit meldet die Position ungeklemmt, Bug
   198597), die Adressleiste feuert nach Spezifikation am `VisualViewport` und
   nicht am `window` (die 0,5-px-Flut aus Bug 226354 trifft ebenfalls nur den
   `VisualViewport`), und Sub-Pixel-Rundung scheidet aus (WebKit rundet vorher).
   Der Filter behebt nicht, was der Kommentar behauptet.
6. **Den Filter durch die Bereichsprüfung ersetzen oder ergänzen** — sie ist
   quellenseitig belegt und trifft das eigentliche Problem: Positionen außerhalb
   von `0 … scrollHeight − innerHeight` sind Gummiband, nichts anderes. Solche
   Ereignisse dürfen den Wächter nicht scharf setzen, und ein Rückweg aus dem
   Gummiband in den gültigen Bereich ebenfalls nicht. Erst nach Änderung von
   Punkt 1 (`none`) sollte sich das Gummiband ohnehin erledigt haben; die
   Prüfung bleibt als Netz für ältere Safari-Versionen.
7. **`scrollend` nicht einbauen** — erst ab Safari 26.2 verfügbar. Der
   300-ms-Nachlauf bleibt.

### `src/composables/useTearGesture.ts`

8. **`setPointerCapture` für `pointerType === 'touch'` weglassen.** Spec §9.4
   und `PointerCaptureController.cpp` sind eindeutig: der Zeiger ist beim
   `pointerdown` bereits eingefangen. Der Aufruf bringt nichts und kollidiert
   möglicherweise mit dem offenen Bug 276287. Für Maus und Stift bleibt er
   nötig. Der `try`-Block darf bleiben.
9. **`onTouchMove` unverändert lassen** — das Abbestellen ab der *ersten*
   Bewegung ist durch `scrollViewWillStartPanOrPinchGesture` belegt richtig. Den
   Kommentar um den Beleg ergänzen: nach `scrollViewWillBeginDragging` setzt
   WebKit `_touchEventsCanPreventNativeGestures = NO`.
10. **Die Begründung im Kopfkommentar präzisieren.** „WebKit haelt sich nicht
    zuverlaessig an `touch-action`" ist pauschal falsch. Richtig und belegbar:
    (a) während Momentum-Scrolling greift auch `touch-action: none` nicht
    (Bug 198708); (b) verschachtelte Hierarchien mit unterschiedlichen Werten
    sind offen fehlerhaft (Bug 194814); (c) fehlt die Event-Region, fällt WebKit
    stillschweigend auf `auto` zurück.
11. **Den Riegel am `pointerdown` (`if (scrolling.value) return`) als tragend
    kennzeichnen.** Bug 198708 belegt: in eine fliegende Wand zu greifen ist der
    eine Fall, in dem `touch-action: none` sicher versagt. Ohne diesen Riegel
    gäbe es dafür keinen Schutz.

### `src/composables/useDirectionPress.ts`

12. **`setPointerCapture` für Touch weglassen**, wie in Punkt 8.
13. **Den Touch-Rückfallweg behalten** und den Kommentar um den Beleg ergänzen:
    WebKit ruft beim Scroll-Beginn `cancelPointersForGestureRecognizer:`, was
    ausschließlich die Zeiger abbricht — die UIKit-Touches laufen weiter. Der
    Weg ist damit nicht spekulativ.
14. **`onTouchMove` unverändert lassen**, aber die Frist dokumentieren: das
    späte `preventDefault()` funktioniert nur, weil der Finger im Moment des
    Auslösens noch still lag und die Pan-Geste deshalb nicht begonnen hat. Sobald
    sie begonnen hat, ist `event.cancelable` `false` und jedes weitere
    `preventDefault()` wirkungslos. Die `if (event.cancelable)`-Abfrage ist also
    kein Vorsichtsmaß, sondern der Regelfall bei jeder Bewegung vor dem
    Auslösen.
15. **Niemals `touch-action: manipulation` auf dem Zettel** — mit diesem Wert
    liefert iOS gar kein `pointercancel` (Bug 240917), und der ganze
    Rückfallweg wäre tot. Als Warnung in die Datei.

### `src/components/WallNote.vue`

16. **`touch-action: none` dauerhaft: unverändert lassen.** Doppelt belegt
    (Pointer Events L3 und WebKit-Quellcode). Den Kommentar um den zusätzlichen
    Grund ergänzen: die Achsenwerte `pan-x`/`pan-y` sind im UI-Prozess laut
    WebKit-eigenem Kommentar („Additional work is needed to respect individual
    values") gar nicht sauber umgesetzt — `none` ist auf iOS der einzige
    verlässliche Wert.
17. **Die Behauptung im `.ear`-Kommentar, eine Änderung mitten in der Geste
    wirke, entfernen** — sie wirkt nicht; der alte `pan-y`-Wechsel hätte erst
    für die *nächste* Berührung gegolten. Die Rückkopplungs-Begründung bleibt
    trotzdem richtig.
18. **Auf echtem Gerät prüfen, ob `will-change: transform` auf `.zettel` die
    Event-Region stört.** Der `touch-action`-Treffertest auf iOS läuft gegen die
    replizierte Layer-Event-Region, und Bug 301838 zeigt für
    `overscroll-behavior` genau so einen Layer-abhängigen Ausfall. Das ist eine
    **Vermutung**, kein Beleg — aber ein billiger Test: `will-change` einmal
    entfernen und das Abreißen erneut probieren.
19. **`@contextmenu.prevent` behalten.** Für die Notwendigkeit gibt es keine
    Primärquelle → **DOKUMENTATION SCHWEIGT**; die Maßnahme ist folgenlos, wenn
    sie überflüssig ist, und der Zettel ist ein Knopf ohne Kontextmenü-Aufgabe.
20. **Kein Fix möglich für Zettel am Bildschirmrand.** Liegt ein Eselsohr in der
    Zurück-Wisch-Zone, gewinnt iOS (Bug 239416). Wenn das im Alltag auffällt,
    hilft nur Layout: die Wand mit seitlichem Rand versehen, sodass kein Griff
    in der Randzone liegt.

---

## Was sich aus Primärquellen NICHT klären ließ

1. **Ob WebKit `scroll`-Ereignisse ohne jede Positionsänderung feuert.**
   DOKUMENTATION SCHWEIGT; die Spezifikation kennt nur „whenever a viewport gets
   scrolled", der Quellcode geht den Weg über `scrollPositionChanged`.
2. **Ein systematischer Unterschied zwischen WebKit und Blink bei der
   Auswertung von `touch-action` oder beim Feuern von `pointercancel`.** Beide
   folgen derselben Spezifikation; ein belegter Verhaltensunterschied ließ sich
   nicht finden.
3. **Verhalten von Control Center, Home-Indikator und Zurück-Wischen gegenüber
   Web-Inhalten**, jenseits von Bug 239416.
4. **Ob `@contextmenu.prevent` auf iOS tatsächlich nötig ist**, um den nativen
   Langdruck abzubrechen. Keine Primärquelle.
5. **Die Safari-Versionsnummer für die Erstauslieferung von
   `touch-action: manipulation`** (Commit von Oktober 2015). Die volle
   Durchsetzung ist über Bug 193447 und Antoine Quints Kommentar in Bug 133112
   auf **iOS 13** datiert.
