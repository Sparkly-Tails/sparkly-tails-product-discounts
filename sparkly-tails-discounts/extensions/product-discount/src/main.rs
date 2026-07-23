use shopify_function::prelude::*;
use std::process;

pub mod cart_lines_discounts_generate_run;

#[typegen("schema.graphql")]
pub mod schema {
    #[query(
        "src/cart_lines_discounts_generate_run.graphql",
        custom_scalar_overrides = {
            "Input.shop.metafield.jsonValue" => super::cart_lines_discounts_generate_run::Config
        }
    )]
    pub mod cart_lines_discounts_generate_run {}
}

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
