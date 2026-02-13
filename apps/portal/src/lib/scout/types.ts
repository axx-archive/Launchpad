/** A single section extracted from a deployed PitchApp */
export interface ManifestSection {
  id: string;
  label: string;
  type: string;
  headline?: string;
  subheadline?: string;
  copy_preview?: string;
  has_background_image: boolean;
  has_metrics: boolean;
  metric_count?: number;
}

/** CSS custom property values extracted from the PitchApp theme */
export interface DesignTokens {
  colors: {
    bg: string;
    text: string;
    accent: string;
    accent_light?: string;
    text_muted?: string;
  };
  fonts: {
    display?: string;
    body?: string;
    mono?: string;
  };
}

/** Metadata about the manifest extraction */
export interface ManifestMeta {
  extracted_at: string;
  source_url?: string;
  total_sections: number;
  total_words: number;
  has_images: boolean;
}

/** Row shape for the pitchapp_manifests table */
export interface PitchAppManifest {
  id: string;
  project_id: string;
  sections: ManifestSection[];
  design_tokens: DesignTokens | null;
  raw_copy: string | null;
  meta: ManifestMeta | null;
  created_at: string;
  updated_at: string;
}
