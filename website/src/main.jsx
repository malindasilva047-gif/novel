import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./site-design.css";
import "./professional-theme.css";

const router = createBrowserRouter(
  [{ path: "*", element: <App /> }],
  { future: { v7_relativeSplatPath: true } },
);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </React.StrictMode>
);
