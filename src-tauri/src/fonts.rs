//! Fonts from Google Fonts, downloaded here so the webview never talks to Google.
//!
//! Google's CSS API needs no key: asked for a family and weight by a client it
//! doesn't recognise, it answers with one `@font-face` pointing at the whole font
//! as a TrueType file on fonts.gstatic.com. That file is all Layer keeps, inside
//! the brand kit, so the font works offline afterwards and travels in projects.

use std::time::Duration;

use reqwest::{Client, StatusCode, Url, redirect::Policy};
use tauri::ipc::Response;

const CSS_URL: &str = "https://fonts.googleapis.com/css2";
const FILE_HOST: &str = "fonts.gstatic.com";
const TIMEOUT: Duration = Duration::from_secs(30);
/// The CSS for one weight is a few hundred bytes.
const MAX_CSS_BYTES: usize = 64 * 1024;
/// Far above a Latin font's few hundred kilobytes; some CJK fonts are larger
/// still, and those are refused rather than kept whole in every project.
const MAX_FONT_BYTES: usize = 12 * 1024 * 1024;
const WEIGHTS: [u16; 3] = [400, 500, 700];

#[derive(Debug, thiserror::Error)]
enum FontError {
    #[error("That isn't the name of a Google font.")]
    BadName,
    #[error("Layer sets text Regular, Medium or Bold.")]
    BadWeight,
    #[error("Google Fonts doesn't have that font in that weight.")]
    NotFound,
    #[error("Layer couldn't reach Google Fonts. Check your connection and try again.")]
    Unreachable,
    #[error("Google Fonts sent something Layer can't use. Try again in a moment.")]
    BadResponse,
    #[error("That font is too large to add.")]
    TooLarge,
}

/// Google's family names are ASCII letters, digits and single spaces.
fn is_family(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_alphanumeric())
        && !name.ends_with(' ')
        && !name.contains("  ")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ')
}

fn css_url(family: &str, weight: u16) -> Url {
    let mut url = Url::parse(CSS_URL).expect("a fixed, valid URL");
    url.query_pairs_mut()
        .append_pair("family", &format!("{family}:wght@{weight}"));
    url
}

/// The font file the CSS points at, only on Google's font host.
fn font_url(css: &str) -> Result<Url, FontError> {
    let start = css.find("url(").ok_or(FontError::BadResponse)? + "url(".len();
    let end = start + css[start..].find(')').ok_or(FontError::BadResponse)?;
    let raw = css[start..end].trim_matches(|c| c == '\'' || c == '"' || c == ' ');
    let url = Url::parse(raw).map_err(|_| FontError::BadResponse)?;
    let trusted = url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str() == Some(FILE_HOST);
    if trusted {
        Ok(url)
    } else {
        Err(FontError::BadResponse)
    }
}

/// No redirects, so nothing can lead away from the two hosts above.
fn client() -> Result<Client, FontError> {
    Client::builder()
        .timeout(TIMEOUT)
        .redirect(Policy::none())
        .user_agent("Layer")
        .build()
        .map_err(|_| FontError::Unreachable)
}

/// The body, stopping as soon as it's longer than it should be.
async fn body_of(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>, FontError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| FontError::Unreachable)? {
        if bytes.len() + chunk.len() > limit {
            return Err(FontError::TooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn fetch_font(family: &str, weight: u16) -> Result<Vec<u8>, FontError> {
    let client = client()?;
    let response = client
        .get(css_url(family, weight))
        .send()
        .await
        .map_err(|_| FontError::Unreachable)?;
    match response.status() {
        // Google answers an unknown family, or a weight it doesn't have, with 400.
        StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND => return Err(FontError::NotFound),
        status if !status.is_success() => return Err(FontError::BadResponse),
        _ => {}
    }
    let css = body_of(response, MAX_CSS_BYTES)
        .await
        .map_err(|error| match error {
            FontError::TooLarge => FontError::BadResponse,
            other => other,
        })?;
    let css = String::from_utf8(css).map_err(|_| FontError::BadResponse)?;

    let response = client
        .get(font_url(&css)?)
        .send()
        .await
        .map_err(|_| FontError::Unreachable)?;
    if !response.status().is_success() {
        return Err(FontError::BadResponse);
    }
    body_of(response, MAX_FONT_BYTES).await
}

/// One weight of a Google font, as raw TrueType bytes: JSON would be slow over IPC.
#[tauri::command]
pub async fn google_font(family: String, weight: u16) -> Result<Response, String> {
    let family = family.trim();
    if !is_family(family) {
        return Err(FontError::BadName.to_string());
    }
    if !WEIGHTS.contains(&weight) {
        return Err(FontError::BadWeight.to_string());
    }
    fetch_font(family, weight)
        .await
        .map(Response::new)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_names_are_plain() {
        for good in ["Inter", "Playfair Display", "M PLUS 1p", "Noto Sans JP"] {
            assert!(is_family(good), "{good}");
        }
        for bad in [
            "",
            " Inter",
            "Inter ",
            "Two  spaces",
            "Inter:wght@900",
            "Inter&family=Roboto",
            "Ïnter",
            &"a".repeat(65),
        ] {
            assert!(!is_family(bad), "{bad}");
        }
    }

    #[test]
    fn asks_for_one_family_and_weight() {
        let url = css_url("Playfair Display", 700);
        assert_eq!(url.host_str(), Some("fonts.googleapis.com"));
        let pairs: Vec<_> = url.query_pairs().collect();
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].1, "Playfair Display:wght@700");
    }

    #[test]
    fn takes_the_font_file_only_from_googles_font_host() {
        let css = "@font-face {\n  font-family: 'Inter';\n  src: url(https://fonts.gstatic.com/s/inter/v20/abc.ttf) format('truetype');\n}";
        assert_eq!(
            font_url(css).expect("a font").as_str(),
            "https://fonts.gstatic.com/s/inter/v20/abc.ttf"
        );

        for css in [
            "src: url(http://fonts.gstatic.com/s/inter.ttf)",
            "src: url(https://evil.example/s/inter.ttf)",
            "src: url(https://fonts.gstatic.com.evil.example/inter.ttf)",
            "src: url(https://user@fonts.gstatic.com/inter.ttf)",
            "src: url(https://fonts.gstatic.com:8443/inter.ttf)",
            "no font here",
            "src: url(https://fonts.gstatic.com/unclosed",
        ] {
            assert!(font_url(css).is_err(), "{css}");
        }
    }

    /// Calls the real service: `cargo test --all-features -- --ignored real_google_font`
    #[tokio::test]
    #[ignore = "needs the network"]
    async fn real_google_font() {
        let bytes = fetch_font("Playfair Display", 700)
            .await
            .expect("downloaded");
        // TrueType files start with version 1.0.
        assert_eq!(&bytes[..4], &[0, 1, 0, 0]);
        assert!(matches!(
            fetch_font("Not A Real Font", 400).await,
            Err(FontError::NotFound)
        ));
    }
}
