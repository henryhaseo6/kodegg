/* @ds-bundle: {"format":3,"namespace":"JEDAKampanyeAntiJudolDesignSystem_c01be6","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Badge","sourcePath":"components/content/Badge.jsx"},{"name":"MythFact","sourcePath":"components/content/MythFact.jsx"},{"name":"Quote","sourcePath":"components/content/Quote.jsx"},{"name":"StatCard","sourcePath":"components/content/StatCard.jsx"},{"name":"Accordion","sourcePath":"components/disclosure/Accordion.jsx"},{"name":"Callout","sourcePath":"components/feedback/Callout.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"HotlineCard","sourcePath":"components/support/HotlineCard.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"bee054ec7016","components/content/Badge.jsx":"e7128e1ad4e3","components/content/MythFact.jsx":"779444bd6fc6","components/content/Quote.jsx":"cbc930acabef","components/content/StatCard.jsx":"c8b328573162","components/disclosure/Accordion.jsx":"3a8889ea6a7e","components/feedback/Callout.jsx":"da8c6a7141e8","components/forms/Checkbox.jsx":"765fe6422605","components/forms/Input.jsx":"aa23aac67842","components/support/HotlineCard.jsx":"b6ee0e576c4e","ui_kits/website/Chrome.jsx":"2869a08c9291","ui_kits/website/Help.jsx":"9d1c368f0ef2","ui_kits/website/Home.jsx":"7c00e6cb9d53","ui_kits/website/SelfCheck.jsx":"378024a13048","ui_kits/website/Stories.jsx":"13eb425051ef"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.JEDAKampanyeAntiJudolDesignSystem_c01be6 = window.JEDAKampanyeAntiJudolDesignSystem_c01be6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    padding: "8px 14px",
    fontSize: "var(--fs-sm)",
    gap: "6px",
    radius: "var(--radius-sm)"
  },
  md: {
    padding: "12px 22px",
    fontSize: "var(--fs-body)",
    gap: "8px",
    radius: "var(--radius-md)"
  },
  lg: {
    padding: "16px 30px",
    fontSize: "var(--fs-body-lg)",
    gap: "10px",
    radius: "var(--radius-md)"
  }
};
function variantStyle(variant) {
  switch (variant) {
    case "secondary":
      return {
        background: "var(--ink-950)",
        color: "var(--text-on-fill)",
        border: "var(--bw-strong) solid transparent"
      };
    case "outline":
      return {
        background: "transparent",
        color: "var(--brand-strong)",
        border: "var(--bw-strong) solid var(--brand)"
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--brand-strong)",
        border: "var(--bw-strong) solid transparent"
      };
    case "danger":
      return {
        background: "var(--danger)",
        color: "#fff",
        border: "var(--bw-strong) solid transparent"
      };
    case "support":
      return {
        background: "var(--success)",
        color: "#fff",
        border: "var(--bw-strong) solid transparent"
      };
    case "primary":
    default:
      return {
        background: "var(--brand)",
        color: "var(--text-on-fill)",
        border: "var(--bw-strong) solid transparent"
      };
  }
}
function Button({
  variant = "primary",
  size = "md",
  block = false,
  leadingIcon,
  trailingIcon,
  disabled = false,
  href,
  type = "button",
  onClick,
  children,
  className,
  style,
  ...rest
}) {
  const sz = SIZES[size] || SIZES.md;
  const vs = variantStyle(variant);
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const baseStyle = {
    display: block ? "flex" : "inline-flex",
    width: block ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: sz.gap,
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--fw-semibold)",
    fontSize: sz.fontSize,
    lineHeight: 1.1,
    letterSpacing: "0.005em",
    padding: sz.padding,
    borderRadius: sz.radius,
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out)",
    opacity: disabled ? 0.45 : 1,
    transform: !disabled && active ? "translateY(1px)" : "translateY(0)",
    filter: !disabled && hover ? "brightness(0.93)" : "none",
    boxShadow: variant === "primary" || variant === "danger" || variant === "support" || variant === "secondary" ? "var(--shadow-sm)" : "none",
    ...vs,
    ...style
  };

  // outline/ghost hover gets a soft tint instead of darken
  if (!disabled && hover && (variant === "outline" || variant === "ghost")) {
    baseStyle.background = "var(--brand-soft)";
    baseStyle.filter = "none";
  }
  const handlers = disabled ? {} : {
    onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false)
  };
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, leadingIcon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex"
    },
    "aria-hidden": "true"
  }, leadingIcon) : null, children ? /*#__PURE__*/React.createElement("span", null, children) : null, trailingIcon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex"
    },
    "aria-hidden": "true"
  }, trailingIcon) : null);
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      className: className,
      style: baseStyle
    }, handlers, rest), content);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: className,
    style: baseStyle,
    disabled: disabled
  }, handlers, rest), content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/content/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: {
    fg: "var(--ink-700)",
    soft: "var(--ink-100)",
    solid: "var(--ink-700)",
    border: "var(--border-strong)"
  },
  brand: {
    fg: "var(--teal-800)",
    soft: "var(--brand-soft)",
    solid: "var(--brand)",
    border: "var(--teal-400)"
  },
  danger: {
    fg: "var(--red-800)",
    soft: "var(--danger-soft)",
    solid: "var(--danger)",
    border: "var(--red-500)"
  },
  myth: {
    fg: "var(--red-800)",
    soft: "var(--danger-soft)",
    solid: "var(--danger)",
    border: "var(--red-500)"
  },
  warning: {
    fg: "var(--amber-700)",
    soft: "var(--warning-soft)",
    solid: "var(--amber-600)",
    border: "var(--amber-500)"
  },
  success: {
    fg: "var(--green-700)",
    soft: "var(--success-soft)",
    solid: "var(--success)",
    border: "var(--green-500)"
  },
  fact: {
    fg: "var(--green-700)",
    soft: "var(--success-soft)",
    solid: "var(--success)",
    border: "var(--green-500)"
  },
  info: {
    fg: "var(--teal-700)",
    soft: "var(--info-soft)",
    solid: "var(--teal-600)",
    border: "var(--teal-400)"
  }
};
function Badge({
  tone = "neutral",
  variant = "soft",
  size = "md",
  icon,
  children,
  className,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  const dims = size === "sm" ? {
    padding: "3px 9px",
    fontSize: "11px"
  } : {
    padding: "5px 12px",
    fontSize: "var(--fs-xs)"
  };
  let look;
  if (variant === "solid") look = {
    background: t.solid,
    color: "#fff",
    border: "1px solid transparent"
  };else if (variant === "outline") look = {
    background: "transparent",
    color: t.fg,
    border: `1px solid ${t.border}`
  };else look = {
    background: t.soft,
    color: t.fg,
    border: "1px solid transparent"
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      fontFamily: "var(--font-mono)",
      fontWeight: "var(--fw-medium)",
      letterSpacing: "var(--tracking-wide)",
      textTransform: "uppercase",
      borderRadius: "var(--radius-pill)",
      lineHeight: 1,
      whiteSpace: "nowrap",
      ...dims,
      ...look,
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex"
    },
    "aria-hidden": "true"
  }, icon) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Badge.jsx", error: String((e && e.message) || e) }); }

// components/content/MythFact.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function MythFact({
  myth,
  fact,
  layout = "stack",
  className,
  style,
  ...rest
}) {
  const split = layout === "split";
  const mythBlock = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-5) var(--space-6)",
      background: "var(--danger-soft)",
      borderRadius: split ? "var(--radius-md)" : "var(--radius-md) var(--radius-md) 0 0",
      borderLeft: "var(--bw-heavy) solid var(--danger)",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "myth",
    variant: "solid",
    size: "sm"
  }, "Mitos"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-3) 0 0",
      fontFamily: "var(--font-serif)",
      fontSize: "var(--fs-body-lg)",
      lineHeight: 1.5,
      color: "var(--red-800)",
      fontStyle: "italic"
    }
  }, "\u201C", myth, "\u201D"));
  const factBlock = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-5) var(--space-6)",
      background: "var(--surface)",
      borderRadius: split ? "var(--radius-md)" : "0 0 var(--radius-md) var(--radius-md)",
      borderLeft: "var(--bw-heavy) solid var(--success)",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "fact",
    variant: "solid",
    size: "sm"
  }, "Fakta"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-3) 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-body)",
      lineHeight: 1.6,
      color: "var(--text-body)",
      fontWeight: "var(--fw-medium)"
    }
  }, fact));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      display: "flex",
      flexDirection: split ? "row" : "column",
      gap: split ? "var(--space-3)" : "var(--bw-hairline)",
      boxShadow: "var(--shadow-sm)",
      borderRadius: "var(--radius-md)",
      background: split ? "transparent" : "var(--surface)",
      overflow: split ? "visible" : "hidden",
      ...style
    }
  }, rest), mythBlock, factBlock);
}
Object.assign(__ds_scope, { MythFact });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/MythFact.jsx", error: String((e && e.message) || e) }); }

// components/content/Quote.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Quote({
  children,
  quote,
  author,
  meta,
  onDark = false,
  size = "lg",
  className,
  style,
  ...rest
}) {
  const text = quote || children;
  const fg = onDark ? "var(--text-on-dark)" : "var(--text-strong)";
  const metaFg = onDark ? "var(--text-on-dark-muted)" : "var(--text-muted)";
  const fontSize = size === "lg" ? "clamp(1.5rem, 3vw, 2rem)" : "var(--fs-h4)";
  return /*#__PURE__*/React.createElement("figure", _extends({
    className: className,
    style: {
      margin: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "block",
      fontFamily: "var(--font-serif)",
      fontSize: "3.5rem",
      lineHeight: 0.5,
      height: "0.7em",
      color: onDark ? "var(--teal-400)" : "var(--brand-mid)"
    }
  }, "\u201C"), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      margin: 0,
      fontFamily: "var(--font-serif)",
      fontSize: fontSize,
      lineHeight: 1.42,
      letterSpacing: "-0.01em",
      color: fg,
      textWrap: "pretty"
    }
  }, text), author || meta ? /*#__PURE__*/React.createElement("figcaption", {
    style: {
      marginTop: "var(--space-5)",
      display: "flex",
      alignItems: "baseline",
      gap: "var(--space-3)",
      flexWrap: "wrap"
    }
  }, author ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--fs-body)",
      color: fg
    }
  }, author) : null, meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-xs)",
      letterSpacing: "var(--tracking-wide)",
      textTransform: "uppercase",
      color: metaFg
    }
  }, meta) : null) : null);
}
Object.assign(__ds_scope, { Quote });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Quote.jsx", error: String((e && e.message) || e) }); }

// components/content/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE_COLOR = {
  ink: "var(--text-strong)",
  brand: "var(--brand)",
  danger: "var(--danger)",
  warning: "var(--amber-600)",
  success: "var(--success)"
};
function StatCard({
  value,
  label,
  source,
  tone = "ink",
  onDark = false,
  align = "left",
  className,
  style,
  ...rest
}) {
  const valueColor = onDark && tone === "ink" ? "var(--text-on-dark)" : TONE_COLOR[tone] || TONE_COLOR.ink;
  const labelColor = onDark ? "var(--text-on-dark)" : "var(--text-body)";
  const sourceColor = onDark ? "var(--text-on-dark-muted)" : "var(--text-muted)";
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      textAlign: align,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--text-stat-font)",
      fontWeight: "var(--text-stat-weight)",
      fontSize: "clamp(2.75rem, 5vw, 4rem)",
      lineHeight: 0.95,
      letterSpacing: "var(--tracking-tighter)",
      color: valueColor,
      fontFeatureSettings: '"tnum" 1'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-3)",
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-semibold)",
      fontSize: "var(--fs-body-lg)",
      lineHeight: 1.35,
      color: labelColor,
      maxWidth: "32ch",
      marginInline: align === "center" ? "auto" : undefined
    }
  }, label), source ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      letterSpacing: "0.04em",
      color: sourceColor
    }
  }, source) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/Accordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Accordion({
  items = [],
  defaultOpen = 0,
  multiple = false,
  className,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(() => defaultOpen >= 0 ? [defaultOpen] : []);
  const toggle = i => {
    setOpen(prev => {
      const isOpen = prev.includes(i);
      if (multiple) return isOpen ? prev.filter(x => x !== i) : [...prev, i];
      return isOpen ? [] : [i];
    });
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      borderTop: "var(--bw-hairline) solid var(--border)",
      ...style
    }
  }, rest), items.map((item, i) => {
    const isOpen = open.includes(i);
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        borderBottom: "var(--bw-hairline) solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggle(i),
      "aria-expanded": isOpen,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        width: "100%",
        padding: "var(--space-5) var(--space-1)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-display)",
        fontWeight: "var(--fw-bold)",
        fontSize: "var(--fs-h4)",
        color: "var(--text-strong)",
        letterSpacing: "var(--tracking-tight)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, item.q), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        display: "inline-flex",
        flex: "0 0 auto",
        transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
        transition: "transform var(--dur-base) var(--ease-out)",
        color: "var(--brand)"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "22",
      height: "22",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.5",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateRows: isOpen ? "1fr" : "0fr",
        transition: "grid-template-rows var(--dur-base) var(--ease-out)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 var(--space-1) var(--space-6)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        lineHeight: 1.65,
        color: "var(--text-body)",
        maxWidth: "62ch"
      }
    }, item.a))));
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  info: {
    fg: "var(--teal-800)",
    bg: "var(--info-soft)",
    bar: "var(--teal-600)",
    glyph: "info"
  },
  warning: {
    fg: "var(--amber-700)",
    bg: "var(--warning-soft)",
    bar: "var(--amber-500)",
    glyph: "triangle-alert"
  },
  danger: {
    fg: "var(--red-800)",
    bg: "var(--danger-soft)",
    bar: "var(--danger)",
    glyph: "octagon-alert"
  },
  success: {
    fg: "var(--green-700)",
    bg: "var(--success-soft)",
    bar: "var(--success)",
    glyph: "heart-handshake"
  }
};
function Callout({
  tone = "info",
  title,
  icon,
  children,
  className,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "note",
    className: className,
    style: {
      display: "flex",
      gap: "var(--space-4)",
      padding: "var(--space-4) var(--space-5)",
      background: t.bg,
      borderRadius: "var(--radius-md)",
      borderLeft: "var(--bw-heavy) solid " + t.bar,
      color: t.fg,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      flex: "0 0 auto",
      marginTop: "2px",
      color: t.bar
    }
  }, icon || /*#__PURE__*/React.createElement("i", {
    "data-lucide": t.glyph,
    style: {
      width: 20,
      height: 20
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--fs-body)",
      color: t.fg,
      marginBottom: children ? "var(--space-1)" : 0
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-sm)",
      lineHeight: 1.6,
      color: t.fg
    }
  }, children) : null));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Callout.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  checked,
  defaultChecked,
  disabled = false,
  id,
  onChange,
  className,
  style,
  ...rest
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(Boolean(defaultChecked));
  const on = isControlled ? checked : internal;
  const autoId = React.useId ? React.useId() : "jeda-cb";
  const cbId = id || autoId;
  const handle = e => {
    if (!isControlled) setInternal(e.target.checked);
    onChange && onChange(e);
  };
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: cbId,
    className: className,
    style: {
      display: "inline-flex",
      alignItems: "flex-start",
      gap: "var(--space-3)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      flex: "0 0 auto",
      width: 22,
      height: 22,
      marginTop: "1px"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: cbId,
    type: "checkbox",
    checked: isControlled ? checked : undefined,
    defaultChecked: isControlled ? undefined : defaultChecked,
    disabled: disabled,
    onChange: handle,
    style: {
      position: "absolute",
      opacity: 0,
      width: "100%",
      height: "100%",
      margin: 0,
      cursor: "inherit"
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 22,
      height: 22,
      borderRadius: "var(--radius-xs)",
      border: "var(--bw-strong) solid " + (on ? "var(--brand)" : "var(--border-strong)"),
      background: on ? "var(--brand)" : "var(--surface-2)",
      color: "#fff",
      transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)"
    }
  }, on ? /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })) : null)), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-body)",
      lineHeight: 1.5,
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  help,
  error,
  leadingIcon,
  id,
  type = "text",
  placeholder,
  value,
  defaultValue,
  disabled = false,
  required = false,
  onChange,
  className,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const autoId = React.useId ? React.useId() : "jeda-input";
  const inputId = id || autoId;
  const invalid = Boolean(error);
  const borderColor = invalid ? "var(--danger)" : focus ? "var(--brand)" : "var(--border-strong)";
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-semibold)",
      fontSize: "var(--fs-sm)",
      color: "var(--text-strong)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger)"
    }
  }, " *") : null) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      background: disabled ? "var(--ink-50)" : "var(--surface-2)",
      border: "var(--bw-strong) solid " + borderColor,
      borderRadius: "var(--radius-md)",
      padding: "0 var(--space-4)",
      boxShadow: focus && !invalid ? "var(--ring-focus)" : invalid && focus ? "var(--ring-danger)" : "none",
      transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
      opacity: disabled ? 0.6 : 1
    }
  }, leadingIcon ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      color: "var(--text-muted)"
    }
  }, leadingIcon) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    disabled: disabled,
    required: required,
    "aria-invalid": invalid || undefined,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-body)",
      color: "var(--text-strong)",
      padding: "12px 0"
    }
  }, rest))), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-sm)",
      color: "var(--danger-strong)"
    }
  }, error) : help ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-sm)",
      color: "var(--text-muted)"
    }
  }, help) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/support/HotlineCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function HotlineCard({
  service,
  number,
  description,
  availability,
  href,
  actionLabel = "Hubungi sekarang",
  onDark = false,
  className,
  style,
  ...rest
}) {
  const bg = onDark ? "var(--teal-900)" : "var(--surface)";
  const titleFg = onDark ? "var(--text-on-dark)" : "var(--text-strong)";
  const numFg = onDark ? "#fff" : "var(--brand-strong)";
  const descFg = onDark ? "var(--text-on-dark-muted)" : "var(--text-muted)";
  const ring = onDark ? "1px solid rgba(255,255,255,0.10)" : "var(--bw-hairline) solid var(--border)";
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)",
      padding: "var(--space-6) var(--space-6) var(--space-6)",
      background: bg,
      border: ring,
      borderRadius: "var(--radius-lg)",
      boxShadow: onDark ? "none" : "var(--shadow-md)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      borderRadius: "var(--radius-pill)",
      background: onDark ? "rgba(80,179,162,0.18)" : "var(--success-soft)",
      color: onDark ? "var(--teal-300)" : "var(--success)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "phone-call",
    style: {
      width: 22,
      height: 22
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-xs)",
      letterSpacing: "var(--tracking-overline)",
      textTransform: "uppercase",
      color: descFg
    }
  }, "Layanan bantuan"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--fs-h4)",
      color: titleFg,
      lineHeight: 1.1
    }
  }, service))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-extrabold)",
      fontSize: "clamp(2rem, 4vw, 2.75rem)",
      letterSpacing: "var(--tracking-tight)",
      color: numFg,
      lineHeight: 1
    }
  }, number), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--fs-sm)",
      lineHeight: 1.6,
      color: descFg
    }
  }, description) : null, availability ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-xs)",
      letterSpacing: "0.04em",
      color: onDark ? "var(--teal-300)" : "var(--success-strong)"
    }
  }, availability) : null, href ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "support",
    href: href,
    block: true,
    leadingIcon: /*#__PURE__*/React.createElement("i", {
      "data-lucide": "phone",
      style: {
        width: 18,
        height: 18
      }
    })
  }, actionLabel) : null);
}
Object.assign(__ds_scope, { HotlineCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/support/HotlineCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Chrome.jsx
try { (() => {
// JEDA website — shared chrome (header + footer + section helpers)
const DS = window.JEDAKampanyeAntiJudolDesignSystem_c01be6;
const NAV = [{
  id: "home",
  label: "Beranda"
}, {
  id: "tanda",
  label: "Kenali Tanda"
}, {
  id: "cerita",
  label: "Cerita"
}, {
  id: "bantuan",
  label: "Butuh Bantuan"
}];
function Logo({
  onDark
}) {
  const src = onDark ? "../../assets/jeda-mark-paper.svg" : "../../assets/jeda-mark.svg";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "JEDA",
    style: {
      width: 34,
      height: 34
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 800,
      fontSize: 22,
      letterSpacing: "0.12em",
      color: onDark ? "#fff" : "var(--text-strong)"
    }
  }, "JEDA"));
}
function Header({
  route,
  go
}) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const el = document.querySelector("#jeda-scroll");
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: scrolled ? "rgba(244,240,230,0.88)" : "transparent",
      backdropFilter: scrolled ? "saturate(140%) blur(10px)" : "none",
      borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      transition: "background var(--dur-base), border-color var(--dur-base)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "16px var(--gutter)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => go("home")
  }, /*#__PURE__*/React.createElement(Logo, null)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, NAV.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    onClick: () => go(n.id),
    style: {
      border: "none",
      background: route === n.id ? "var(--brand-soft)" : "transparent",
      color: route === n.id ? "var(--brand-strong)" : "var(--text-body)",
      fontFamily: "var(--font-sans)",
      fontWeight: 600,
      fontSize: 14,
      padding: "9px 14px",
      borderRadius: "var(--radius-pill)",
      cursor: "pointer"
    }
  }, n.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8
    }
  }), /*#__PURE__*/React.createElement(DS.Button, {
    size: "sm",
    variant: "support",
    leadingIcon: /*#__PURE__*/React.createElement("i", {
      "data-lucide": "phone",
      style: {
        width: 16,
        height: 16
      }
    }),
    onClick: () => go("bantuan")
  }, "Hotline 119 ext 8"))));
}
function Footer({
  go
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--ink-950)",
      color: "var(--text-on-dark)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "64px var(--gutter) 40px",
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr 1fr",
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Logo, {
    onDark: true
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 16,
      maxWidth: "34ch",
      color: "var(--text-on-dark-muted)",
      fontSize: 15,
      lineHeight: 1.7
    }
  }, "Kampanye edukasi publik tentang bahaya judi online. Tidak menjual apa pun \u2014 hanya mengajak kamu mengambil jeda.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--text-on-dark-muted)",
      marginBottom: 14
    }
  }, "Jelajahi"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, NAV.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    onClick: () => go(n.id),
    style: {
      border: "none",
      background: "none",
      color: "var(--text-on-dark)",
      textAlign: "left",
      padding: 0,
      cursor: "pointer",
      fontFamily: "var(--font-sans)",
      fontSize: 15
    }
  }, n.label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--text-on-dark-muted)",
      marginBottom: 14
    }
  }, "Bantuan darurat"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 800,
      fontSize: 26,
      color: "#fff"
    }
  }, "119 ext 8"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--teal-300)",
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      marginTop: 4
    }
  }, "24 jam \xB7 gratis \xB7 rahasia"))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid rgba(255,255,255,0.08)",
      padding: "20px var(--gutter)",
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-on-dark-muted)",
      fontFamily: "var(--font-mono)"
    }
  }, "\xA9 2026 JEDA \xB7 Kampanye edukasi non-komersial"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-on-dark-muted)",
      fontFamily: "var(--font-mono)"
    }
  }, "Demo design system \u2014 bukan situs resmi")));
}

// Reusable section eyebrow + title
function SectionHead({
  eyebrow,
  title,
  intro,
  onDark,
  align = "left"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: align === "center" ? 720 : 760,
      marginInline: align === "center" ? "auto" : 0,
      textAlign: align,
      marginBottom: 40
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "jeda-overline",
    style: {
      color: onDark ? "var(--teal-300)" : "var(--brand)",
      marginBottom: 14
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)",
      color: onDark ? "#fff" : "var(--text-strong)",
      margin: 0
    }
  }, title), intro ? /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 16,
      fontSize: 18,
      lineHeight: 1.65,
      color: onDark ? "var(--text-on-dark-muted)" : "var(--text-muted)"
    }
  }, intro) : null);
}

// Photo placeholder (replace with real documentary photography)
function Photo({
  label = "Foto dokumenter",
  h = 240,
  tone = "ink",
  style
}) {
  const bg = tone === "teal" ? "var(--teal-800)" : "var(--ink-800)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: h,
      borderRadius: "var(--radius-lg)",
      background: bg,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.06), transparent 60%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      color: "rgba(255,255,255,0.45)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "image",
    style: {
      width: 28,
      height: 28
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.08em"
    }
  }, label)));
}
window.JedaChrome = {
  DS,
  NAV,
  Logo,
  Header,
  Footer,
  SectionHead,
  Photo
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Help.jsx
try { (() => {
// JEDA website — "Butuh Bantuan" help & resources
(function () {
  const {
    DS,
    SectionHead,
    Photo
  } = window.JedaChrome;
  const FAQ = [{
    q: "Apakah kecanduan judol bisa benar-benar pulih?",
    a: "Bisa. Kecanduan judi diakui sebagai gangguan yang dapat ditangani. Banyak orang pulih dengan kombinasi konseling, dukungan orang terdekat, dan memutus akses (blokir situs, titip kontrol keuangan). Pemulihan adalah proses bertahap, bukan sekali jadi — dan kambuh bukan berarti gagal."
  }, {
    q: "Apakah layanannya berbayar?",
    a: "Tidak. Layanan SEJIWA di 119 ext 8 dari Kementerian Kesehatan gratis dan rahasia. Banyak puskesmas dan RS juga menyediakan layanan kesehatan jiwa dasar."
  }, {
    q: "Bagaimana cara membantu orang terdekat yang terjebak?",
    a: "Dengarkan tanpa menghakimi, jangan langsung menalangi utangnya (itu sering memperpanjang), bantu memutus akses, dan ajak menghubungi layanan bantuan bersama-sama. Jaga juga kesehatan mentalmu sendiri."
  }, {
    q: "Apakah identitasku aman jika menghubungi hotline?",
    a: "Ya. Layanan konseling bersifat rahasia. Kamu boleh menggunakan nama samaran dan tidak wajib membeberkan identitas."
  }, {
    q: "Aku sudah berhenti tapi sering ingin main lagi. Normal?",
    a: "Sangat normal. Dorongan (urge) bisa muncul lama setelah berhenti, terutama saat stres. Strateginya: kenali pemicunya, alihkan ke aktivitas lain, dan punya satu orang yang bisa kamu hubungi saat dorongan datang."
  }];
  function StepCard({
    n,
    icon,
    title,
    body
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        padding: "24px 22px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        borderRadius: "var(--radius-pill)",
        background: "var(--brand-soft)",
        color: "var(--brand-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("i", {
      "data-lucide": icon,
      style: {
        width: 20,
        height: 20
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)",
        letterSpacing: "0.08em"
      }
    }, "LANGKAH ", n)), /*#__PURE__*/React.createElement("h4", {
      style: {
        margin: "0 0 8px"
      }
    }, title), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 14.5,
        lineHeight: 1.6,
        color: "var(--text-body)"
      }
    }, body));
  }
  function Help({
    go
  }) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--ink-950)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "clamp(56px,8vw,96px) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      onDark: true,
      align: "center",
      eyebrow: "Butuh bantuan",
      title: "Ada orang yang siap mendengar.",
      intro: "Kalau kamu atau orang terdekat terdampak judi online, hubungi salah satu layanan ini. Gratis, rahasia, dan tanpa menghakimi."
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 22,
        maxWidth: 820,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement(DS.HotlineCard, {
      service: "SEJIWA \u2014 Kemenkes",
      number: "119 ext 8",
      description: "Konseling kesehatan jiwa & kecanduan, termasuk judi online.",
      availability: "24 jam \xB7 gratis \xB7 rahasia",
      href: "tel:119",
      onDark: true
    }), /*#__PURE__*/React.createElement(DS.HotlineCard, {
      service: "LISA Suicide Prevention",
      number: "021-9696-9293",
      description: "Dukungan krisis bagi yang merasa putus asa atau ingin menyakiti diri.",
      availability: "Setiap hari \xB7 rahasia",
      href: "tel:02196969293",
      onDark: true
    })))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      eyebrow: "Mulai dari mana",
      title: "Tiga langkah pertama untuk mengambil jeda"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: 20
      }
    }, /*#__PURE__*/React.createElement(StepCard, {
      n: "1",
      icon: "shield-off",
      title: "Putus akses",
      body: "Hapus aplikasi, blokir situs lewat pemblokir, dan minta orang terpercaya memegang kontrol keuangan sementara."
    }), /*#__PURE__*/React.createElement(StepCard, {
      n: "2",
      icon: "users",
      title: "Cerita ke satu orang",
      body: "Pilih satu orang yang kamu percaya. Mengucapkannya dengan keras memutus rasa malu yang membuatmu terus main."
    }), /*#__PURE__*/React.createElement(StepCard, {
      n: "3",
      icon: "phone-call",
      title: "Hubungi konselor",
      body: "Telepon 119 ext 8. Kamu tidak perlu punya semua jawaban \u2014 cukup mulai bicara."
    })))), /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--canvas-2)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 860,
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      eyebrow: "Pertanyaan",
      title: "Yang sering ditanyakan"
    }), /*#__PURE__*/React.createElement(DS.Accordion, {
      defaultOpen: 0,
      items: FAQ
    }))), /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--brand)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 720,
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        color: "#fff",
        fontSize: "clamp(1.9rem,4vw,2.8rem)",
        margin: 0
      }
    }, "Hari ini cukup untuk memulai."), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 18,
        marginTop: 16,
        lineHeight: 1.6
      }
    }, "Tidak perlu langsung sembuh. Cukup ambil satu jeda \u2014 satu telepon, satu cerita."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 26
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      size: "lg",
      variant: "secondary",
      href: "tel:119",
      leadingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "phone",
        style: {
          width: 18,
          height: 18
        }
      })
    }, "Telepon 119 ext 8")))));
  }
  window.JedaHelp = Help;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Help.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Home.jsx
try { (() => {
// JEDA website — Home / landing page
(function () {
  const {
    DS,
    SectionHead,
    Photo
  } = window.JedaChrome;
  function Hero({
    go
  }) {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        position: "relative",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "clamp(48px, 9vw, 110px) var(--gutter) clamp(40px, 7vw, 84px)",
        display: "grid",
        gridTemplateColumns: "1.15fr 0.85fr",
        gap: 56,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "jeda-overline",
      style: {
        color: "var(--brand)",
        marginBottom: 22
      }
    }, "Kampanye edukasi \xB7 Lawan judi online"), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: "clamp(2.6rem, 6.5vw, 5rem)",
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
        margin: 0,
        color: "var(--text-strong)"
      }
    }, "Berhenti itu", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--brand)"
      }
    }, "menang.")), /*#__PURE__*/React.createElement("p", {
      style: {
        marginTop: 24,
        fontSize: "clamp(1.05rem, 2vw, 1.3rem)",
        lineHeight: 1.6,
        color: "var(--text-body)",
        maxWidth: "44ch"
      }
    }, "Judi online dirancang supaya kamu kalah pelan-pelan. Ambil jeda hari ini \u2014 kenali jebakannya, dengar cerita yang pulih, dan temukan bantuan yang nyata."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 14,
        marginTop: 34,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      size: "lg",
      variant: "primary",
      trailingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "arrow-right",
        style: {
          width: 18,
          height: 18
        }
      }),
      onClick: () => go("tanda")
    }, "Kenali tanda kecanduan"), /*#__PURE__*/React.createElement(DS.Button, {
      size: "lg",
      variant: "outline",
      onClick: () => go("bantuan")
    }, "Cari bantuan")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 26,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 12.5
      }
    }, /*#__PURE__*/React.createElement("i", {
      "data-lucide": "lock",
      style: {
        width: 15,
        height: 15
      }
    }), "Rahasia \xB7 gratis \xB7 tanpa menghakimi")), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(Photo, {
      label: "Potret \u2014 seseorang menutup aplikasi",
      h: 420,
      tone: "teal",
      style: {
        borderRadius: "var(--radius-xl)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        bottom: -22,
        left: -22,
        background: "var(--surface)",
        boxShadow: "var(--shadow-lg)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        maxWidth: 230
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: 30,
        color: "var(--danger)",
        lineHeight: 1
      }
    }, "80%"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        lineHeight: 1.5,
        color: "var(--text-body)",
        marginTop: 6
      }
    }, "pemain akhirnya rugi lebih besar dari yang pernah mereka menangkan.")))));
  }
  function StatBand() {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--ink-950)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      onDark: true,
      eyebrow: "Skala masalahnya",
      title: "Ini bukan masalah kecil.",
      intro: "Judi online sudah menyentuh jutaan keluarga di Indonesia. Angkanya tidak main-main."
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 40,
        marginTop: 8
      }
    }, /*#__PURE__*/React.createElement(DS.StatCard, {
      onDark: true,
      value: "Rp 327T",
      label: "Total perputaran uang judi online (2023)",
      source: "Sumber: PPATK",
      tone: "danger"
    }), /*#__PURE__*/React.createElement(DS.StatCard, {
      onDark: true,
      value: "8,8 juta",
      label: "warga Indonesia terpapar judi online",
      source: "Sumber: PPATK",
      tone: "warning"
    }), /*#__PURE__*/React.createElement(DS.StatCard, {
      onDark: true,
      value: "2,1 juta",
      label: "di antaranya berpenghasilan di bawah Rp 100rb/hari",
      source: "Sumber: PPATK",
      tone: "ink"
    }))));
  }
  function MythSection() {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--canvas-2)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      eyebrow: "Mitos vs fakta",
      title: "Pikiran yang membuatmu terus main",
      intro: "Setiap jebakan judol dibangun di atas keyakinan keliru. Kenali, lalu patahkan."
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 22
      }
    }, /*#__PURE__*/React.createElement(DS.MythFact, {
      myth: "Tinggal sekali lagi, pasti balik modal.",
      fact: "Setiap putaran berdiri sendiri. Kekalahan kemarin tidak membuat menang berikutnya lebih mungkin \u2014 itu gambler's fallacy. Rumah selalu diprogram untung."
    }), /*#__PURE__*/React.createElement(DS.MythFact, {
      myth: "Aku bisa berhenti kapan saja.",
      fact: "Judol memakai reward acak untuk membentuk kebiasaan kompulsif. Kalau sulit berhenti, itu bukan soal kemauan \u2014 itu pola kecanduan."
    }), /*#__PURE__*/React.createElement(DS.MythFact, {
      myth: "Ada jam & pola 'gacor' yang bisa dibaca.",
      fact: "Hasilnya dikendalikan algoritma acak (RNG) yang disetel untuk menguntungkan bandar. 'Pola gacor' hanyalah pemasaran."
    }), /*#__PURE__*/React.createElement(DS.MythFact, {
      myth: "Bonus & saldo gratis bikin aku untung.",
      fact: "Bonus adalah umpan dengan syarat taruhan berlapis. Tujuannya membuatmu menyetor lebih banyak, bukan menarik untung."
    }))));
  }
  function StoryTeaser({
    go
  }) {
    return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "0.9fr 1.1fr",
        gap: 56,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Photo, {
      label: "Potret \u2014 Andi, 24",
      h: 360,
      tone: "ink",
      style: {
        borderRadius: "var(--radius-xl)"
      }
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "jeda-overline",
      style: {
        color: "var(--brand)",
        marginBottom: 18
      }
    }, "Cerita yang pulih"), /*#__PURE__*/React.createElement(DS.Quote, {
      author: "Andi, 24",
      meta: "Pulih 8 bulan",
      quote: "Aku kira aku lagi cari rezeki. Ternyata aku lagi diprogram buat kalah. Hari aku hapus semua aplikasinya, baru aku bisa napas lagi."
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 30
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      variant: "ghost",
      trailingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "arrow-right",
        style: {
          width: 18,
          height: 18
        }
      }),
      onClick: () => go("cerita")
    }, "Baca cerita lainnya"))))));
  }
  function CtaBand({
    go
  }) {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--brand)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)",
        display: "grid",
        gridTemplateColumns: "1.2fr 0.8fr",
        gap: 48,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      style: {
        color: "#fff",
        fontSize: "clamp(2rem, 4vw, 3rem)",
        margin: 0
      }
    }, "Kamu tidak harus menghadapinya sendiri."), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 18,
        lineHeight: 1.6,
        marginTop: 18,
        maxWidth: "46ch"
      }
    }, "Kalau kamu atau orang terdekat terjebak, ada orang yang siap mendengar \u2014 gratis dan rahasia."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 28
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      size: "lg",
      variant: "secondary",
      onClick: () => go("bantuan"),
      leadingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "heart-handshake",
        style: {
          width: 18,
          height: 18
        }
      })
    }, "Lihat semua bantuan"))), /*#__PURE__*/React.createElement(DS.HotlineCard, {
      service: "SEJIWA",
      number: "119 ext 8",
      description: "Konseling untuk kamu atau orang terdekat yang terdampak judi online.",
      availability: "24 jam \xB7 gratis \xB7 rahasia",
      href: "tel:119",
      onDark: true
    })));
  }
  function Home({
    go
  }) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Hero, {
      go: go
    }), /*#__PURE__*/React.createElement(StatBand, null), /*#__PURE__*/React.createElement(MythSection, null), /*#__PURE__*/React.createElement(StoryTeaser, {
      go: go
    }), /*#__PURE__*/React.createElement(CtaBand, {
      go: go
    }));
  }
  window.JedaHome = Home;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SelfCheck.jsx
try { (() => {
// JEDA website — "Kenali Tanda" interactive self-check
(function () {
  const {
    DS,
    SectionHead,
    Photo
  } = window.JedaChrome;
  const SIGNS = ["Aku main lebih sering atau lebih lama dari yang kurencanakan.", "Aku berbohong soal berapa banyak uang atau waktu yang kuhabiskan.", "Aku mengejar kekalahan — terus main untuk balik modal.", "Aku meminjam uang, menjual barang, atau pakai uang kebutuhan untuk main.", "Aku gelisah, mudah marah, atau sulit tidur saat mencoba berhenti.", "Judol mulai mengganggu kerja, kuliah, atau hubunganku.", "Aku merasa lega hanya saat sedang bermain.", "Orang terdekat sudah menyatakan khawatir soal kebiasaan mainku."];
  function SelfCheck({
    go
  }) {
    const [checked, setChecked] = React.useState({});
    const [submitted, setSubmitted] = React.useState(false);
    const count = Object.values(checked).filter(Boolean).length;
    const toggle = i => setChecked(c => ({
      ...c,
      [i]: !c[i]
    }));
    let band;
    if (count <= 1) band = {
      tone: "success",
      title: "Risiko rendah",
      msg: "Tandanya sedikit — tapi tetap waspada. Judol dirancang untuk menarik siapa pun perlahan. Kenali jebakannya sebelum jadi kebiasaan."
    };else if (count <= 3) band = {
      tone: "warning",
      title: "Mulai berisiko",
      msg: "Beberapa tanda sudah muncul. Ini saat yang tepat untuk mengambil jeda: putus akses, cerita ke orang terpercaya, dan pertimbangkan menghubungi konselor."
    };else band = {
      tone: "danger",
      title: "Tanda kuat — saatnya cari bantuan",
      msg: "Banyak tanda yang kamu kenali. Ini bukan tentang lemah; ini pola kecanduan yang nyata. Kamu tidak harus menghadapinya sendiri — hubungi layanan bantuan hari ini."
    };
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--ink-950)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "clamp(56px,8vw,96px) var(--gutter)",
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",
        gap: 48,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "jeda-overline",
      style: {
        color: "var(--teal-300)",
        marginBottom: 18
      }
    }, "Kenali tanda"), /*#__PURE__*/React.createElement("h1", {
      style: {
        color: "#fff",
        fontSize: "clamp(2.2rem,5vw,3.6rem)",
        lineHeight: 1.05,
        margin: 0
      }
    }, "Cek sendiri, dalam 1 menit."), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-on-dark-muted)",
        fontSize: 18,
        lineHeight: 1.65,
        marginTop: 20,
        maxWidth: "46ch"
      }
    }, "Centang yang terasa benar untukmu. Tidak ada yang menilai, tidak ada data yang disimpan. Ini hanya untukmu, supaya lebih jujur pada diri sendiri.")), /*#__PURE__*/React.createElement(Photo, {
      label: "Potret \u2014 refleksi diri",
      h: 300,
      tone: "teal",
      style: {
        borderRadius: "var(--radius-xl)"
      }
    }))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 820,
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-md)",
        padding: "clamp(24px,4vw,44px)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 24,
        flexWrap: "wrap",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0
      }
    }, "Dalam 12 bulan terakhir\u2026"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: "var(--text-muted)"
      }
    }, count, " / ", SIGNS.length, " dicentang")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16
      }
    }, SIGNS.map((s, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        padding: "14px 16px",
        borderRadius: "var(--radius-md)",
        background: checked[i] ? "var(--warning-soft)" : "var(--canvas)",
        border: "1px solid " + (checked[i] ? "var(--amber-300)" : "var(--border)"),
        transition: "background var(--dur-fast), border-color var(--dur-fast)"
      }
    }, /*#__PURE__*/React.createElement(DS.Checkbox, {
      checked: !!checked[i],
      onChange: () => toggle(i),
      label: s
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 28,
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      variant: "primary",
      onClick: () => setSubmitted(true)
    }, "Lihat hasilku"), /*#__PURE__*/React.createElement(DS.Button, {
      variant: "ghost",
      onClick: () => {
        setChecked({});
        setSubmitted(false);
      }
    }, "Reset")), submitted ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 28
      }
    }, /*#__PURE__*/React.createElement(DS.Callout, {
      tone: band.tone,
      title: band.title
    }, band.msg), count >= 2 ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      variant: "support",
      leadingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "phone",
        style: {
          width: 18,
          height: 18
        }
      }),
      onClick: () => go("bantuan")
    }, "Hubungi bantuan sekarang")) : null) : null), /*#__PURE__*/React.createElement("p", {
      style: {
        textAlign: "center",
        marginTop: 22,
        fontSize: 13.5,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)"
      }
    }, "Bukan diagnosis medis. Untuk penilaian menyeluruh, hubungi tenaga profesional."))));
  }
  window.JedaSelfCheck = SelfCheck;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SelfCheck.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Stories.jsx
try { (() => {
// JEDA website — "Cerita" recovery stories
(function () {
  const {
    DS,
    SectionHead,
    Photo
  } = window.JedaChrome;
  const STORIES = [{
    name: "Andi, 24",
    meta: "Pulih 8 bulan",
    tone: "ink",
    quote: "Aku kira aku lagi cari rezeki. Ternyata aku lagi diprogram buat kalah. Hari aku hapus semua aplikasinya, baru aku bisa napas lagi.",
    body: "Mulai dari iklan di kolom komentar. Dalam tiga bulan, gaji habis sebelum tengah bulan. Yang menolong: cerita jujur ke kakak, dan minta dia pegang kartu ATM-ku sementara."
  }, {
    name: "Sari, 31",
    meta: "Mendampingi suami",
    tone: "teal",
    quote: "Aku belajar bahwa marah-marah tidak menyembuhkan. Yang berhasil adalah berhenti menalangi utangnya dan ikut konseling bareng.",
    body: "Awalnya aku terus menutup lubang utangnya — dan itu malah memperpanjang. Setelah ikut sesi keluarga di SEJIWA, kami menyusun batas yang jelas. Pelan, tapi membaik."
  }, {
    name: "Bagas, 19",
    meta: "Pulih 1 tahun",
    tone: "ink",
    quote: "Teman-temanku bilang 'tinggal sekali lagi'. Sekali lagi itu yang bikin aku nyaris putus kuliah.",
    body: "Tekanan teman sebaya itu nyata. Aku akhirnya cerita ke dosen wali, pindah circle, dan pasang pemblokir situs. Sekarang aku bantu teman lain keluar."
  }];
  function StoryCard({
    s,
    reverse
  }) {
    return /*#__PURE__*/React.createElement("article", {
      style: {
        display: "grid",
        gridTemplateColumns: reverse ? "1fr 0.8fr" : "0.8fr 1fr",
        gap: 44,
        alignItems: "center",
        direction: reverse ? "rtl" : "ltr"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        direction: "ltr"
      }
    }, /*#__PURE__*/React.createElement(Photo, {
      label: "Potret — " + s.name,
      h: 300,
      tone: s.tone,
      style: {
        borderRadius: "var(--radius-xl)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        direction: "ltr"
      }
    }, /*#__PURE__*/React.createElement(DS.Quote, {
      size: "md",
      author: s.name,
      meta: s.meta,
      quote: s.quote
    }), /*#__PURE__*/React.createElement("p", {
      style: {
        marginTop: 20,
        fontSize: 16,
        lineHeight: 1.7,
        color: "var(--text-body)",
        maxWidth: "52ch"
      }
    }, s.body)));
  }
  function Stories({
    go
  }) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "clamp(56px,8vw,96px) var(--gutter) 0"
      }
    }, /*#__PURE__*/React.createElement(SectionHead, {
      align: "center",
      eyebrow: "Cerita yang pulih",
      title: "Berhenti itu mungkin. Ini buktinya.",
      intro: "Cerita nyata (nama disamarkan) dari orang yang berhasil mengambil jeda \u2014 dan keluarga yang mendampingi mereka."
    }))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        padding: "32px var(--gutter) var(--section-y)",
        display: "flex",
        flexDirection: "column",
        gap: 72
      }
    }, STORIES.map((s, i) => /*#__PURE__*/React.createElement(StoryCard, {
      key: i,
      s: s,
      reverse: i % 2 === 1
    })))), /*#__PURE__*/React.createElement("section", {
      style: {
        background: "var(--canvas-2)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 720,
        margin: "0 auto",
        padding: "var(--section-y) var(--gutter)",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "jeda-overline",
      style: {
        color: "var(--brand)",
        marginBottom: 16
      }
    }, "Ceritamu penting"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "clamp(1.8rem,3.6vw,2.5rem)",
        margin: 0
      }
    }, "Pernah mengambil jeda?"), /*#__PURE__*/React.createElement("p", {
      style: {
        marginTop: 16,
        fontSize: 18,
        lineHeight: 1.65,
        color: "var(--text-muted)"
      }
    }, "Cerita yang jujur bisa jadi titik balik bagi orang lain. Kamu bisa berbagi secara anonim."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 28,
        display: "flex",
        gap: 14,
        justifyContent: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(DS.Button, {
      variant: "primary",
      leadingIcon: /*#__PURE__*/React.createElement("i", {
        "data-lucide": "pen-line",
        style: {
          width: 18,
          height: 18
        }
      })
    }, "Bagikan ceritamu"), /*#__PURE__*/React.createElement(DS.Button, {
      variant: "outline",
      onClick: () => go("bantuan")
    }, "Cari bantuan")))));
  }
  window.JedaStories = Stories;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Stories.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.MythFact = __ds_scope.MythFact;

__ds_ns.Quote = __ds_scope.Quote;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.HotlineCard = __ds_scope.HotlineCard;

})();
