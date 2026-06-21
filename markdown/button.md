Adapte o componente abaixo para a situação do projeto, pegando somente o que for necessario para montar o componente de acordo com o nosso projeto, isso se aplica em cores, tamanhos e etc.

<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Singular Intent - AI Interface</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<!-- Tailwind Config Verbatim -->
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "on-tertiary": "#4f2500",
                    "surface-container-lowest": "#0e0e0e",
                    "surface-container-low": "#1b1b1b",
                    "tertiary-fixed": "#ffdcc6",
                    "surface-container": "#1f1f1f",
                    "on-secondary-fixed": "#21005e",
                    "inverse-primary": "#732ee4",
                    "surface-bright": "#393939",
                    "on-primary-fixed-variant": "#5a00c6",
                    "primary": "#d2bbff",
                    "on-error": "#690005",
                    "primary-fixed": "#eaddff",
                    "surface-container-highest": "#353535",
                    "surface-variant": "#353535",
                    "secondary-container": "#4f319c",
                    "inverse-surface": "#e2e2e2",
                    "secondary-fixed": "#e8ddff",
                    "on-primary-container": "#ede0ff",
                    "tertiary-fixed-dim": "#ffb784",
                    "tertiary": "#ffb784",
                    "surface-dim": "#131313",
                    "on-surface-variant": "#ccc3d8",
                    "on-surface": "#e2e2e2",
                    "surface": "#131313",
                    "error-container": "#93000a",
                    "on-secondary": "#381385",
                    "primary-container": "#7c3aed",
                    "on-error-container": "#ffdad6",
                    "on-primary": "#3f008e",
                    "background": "#131313",
                    "error": "#ffb4ab",
                    "on-background": "#e2e2e2",
                    "outline-variant": "#4a4455",
                    "inverse-on-surface": "#303030",
                    "secondary-fixed-dim": "#cebdff",
                    "on-secondary-fixed-variant": "#4f319c",
                    "secondary": "#cebdff",
                    "primary-fixed-dim": "#d2bbff",
                    "on-primary-fixed": "#25005a",
                    "surface-container-high": "#2a2a2a",
                    "on-tertiary-fixed-variant": "#713700",
                    "outline": "#958da1",
                    "on-tertiary-fixed": "#301400",
                    "on-tertiary-container": "#ffe0cd",
                    "tertiary-container": "#a15100",
                    "surface-tint": "#d2bbff",
                    "on-secondary-container": "#bea8ff"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "md": "24px",
                    "xs": "4px",
                    "lg": "48px",
                    "xl": "80px",
                    "container-max": "800px",
                    "sm": "12px",
                    "base": "8px"
            },
            "fontFamily": {
                    "body-md": ["Geist", "sans-serif"],
                    "body-lg": ["Geist", "sans-serif"],
                    "display": ["Geist", "sans-serif"],
                    "label-mono": ["JetBrains Mono", "monospace"],
                    "headline-md": ["Geist", "sans-serif"],
                    "button-text": ["Geist", "sans-serif"]
            },
            "fontSize": {
                    "body-md": ["16px", {"lineHeight": "1.5", "letterSpacing": "0", "fontWeight": "400"}],
                    "body-lg": ["18px", {"lineHeight": "1.6", "letterSpacing": "0", "fontWeight": "400"}],
                    "display": ["48px", {"lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "600"}],
                    "label-mono": ["12px", {"lineHeight": "1.0", "letterSpacing": "0.05em", "fontWeight": "500"}],
                    "headline-md": ["24px", {"lineHeight": "1.2", "letterSpacing": "-0.01em", "fontWeight": "500"}],
                    "button-text": ["14px", {"lineHeight": "1.0", "letterSpacing": "0.02em", "fontWeight": "600"}]
            }
          },
        },
      }
    </script>
<style>
        body {
            background-color: #000000;
            overflow: hidden;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100vw;
        }

        .glow-effect {
            box-shadow: 0px 0px 20px rgba(124, 58, 237, 0.3);
            transition: box-shadow 0.3s ease, transform 0.2s ease, background-color 0.3s ease;
        }

        .glow-effect:hover {
            box-shadow: 0px 0px 35px rgba(124, 58, 237, 0.6);
            background-color: #8b5cf6; /* Slightly brighter violet on hover */
            transform: scale(1.02);
        }

        .glow-effect:active {
            transform: scale(0.95);
            box-shadow: 0px 0px 10px rgba(124, 58, 237, 0.4);
        }

        /* Subtle atmospheric pulse */
        @keyframes pulse-opacity {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }

        .thinking {
            animation: pulse-opacity 1.5s infinite ease-in-out;
        }

        /* Ambient background glow */
        .ambient-radial {
            background: radial-gradient(circle at center, rgba(124, 58, 237, 0.05) 0%, rgba(0,0,0,0) 70%);
            position: absolute;
            inset: 0;
            pointer-events: none;
        }
    </style>

<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
</head>
<body class="bg-[#000000] text-on-surface antialiased">
<!-- Ambient background layer -->
<div class="ambient-radial"></div>
<!-- Centered Interaction Area -->
<main class="relative z-10 flex flex-col items-center justify-center w-full max-w-container-max px-md">
<!-- Status Indicator (System mandated) -->
<!-- The Hero Button -->
<button class="glow-effect flex items-center justify-center gap-sm bg-primary-container text-white px-xl py-md rounded-full transition-all duration-300 group" id="send-button" onclick="triggerInteraction()">
<span class="material-symbols-outlined text-[24px] group-hover:rotate-12 transition-transform duration-300" data-icon="bolt">bolt</span>
<span class="font-button-text text-button-text tracking-[0.1em] uppercase">Send</span>
</button>
<!-- Decorative Micro-detail -->
</main>
<script>
        function triggerInteraction() {
            const button = document.getElementById('send-button');
            const status = document.getElementById('status-text');
            
            // Toggle "Thinking" state
            button.classList.add('thinking');
            status.textContent = 'Thinking';
            status.classList.add('text-primary');
            
            // Simulate AI delay
            setTimeout(() => {
                button.classList.remove('thinking');
                status.textContent = 'Complete';
                
                // Return to ready after feedback
                setTimeout(() => {
                    status.textContent = 'Ready';
                }, 2000);
            }, 2500);
        }

        // Mouse follow parallax effect for the ambient glow
        document.addEventListener('mousemove', (e) => {
            const radial = document.querySelector('.ambient-radial');
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            radial.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(124, 58, 237, 0.08) 0%, rgba(0,0,0,0) 60%)`;
        });
    </script>

</body></html>
