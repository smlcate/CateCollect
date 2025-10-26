import gradio as gr
import signal

from gui.ui_tab_short_automation import ShortAutomationUI  # ✅ updated
from gui.ui_abstract_base import AbstractBaseUI
from gui.ui_components_html import GradioComponentsHTML
from gui.ui_tab_asset_library import AssetLibrary
from gui.ui_tab_config import ConfigUI
from shortGPT.utils.cli import CLI


class ShortGptUI(AbstractBaseUI):
    """Class for the GUI. This class is responsible for creating the UI and launching the server."""

    def __init__(self, colab=False):
        super().__init__(ui_name='gradio_shortgpt')
        self.colab = colab
        CLI.display_header()

    def create_interface(self):
        '''Create Gradio interface'''
        with gr.Blocks(theme=gr.themes.Default(spacing_size=gr.themes.sizes.spacing_sm), css="footer {visibility: hidden}", title="ShortGPT Demo") as shortGptUI:
            with gr.Row(variant='compact'):
                gr.HTML(GradioComponentsHTML.get_html_header())

            with gr.Tabs():
                with gr.Tab("Short Automation") as short_automation_tab:
                    ui = ShortAutomationUI(self)
                    short_automation_tab_elem = ui.create_ui()


                with gr.Tab("Assets"):
                    self.asset_library_ui = AssetLibrary().create_ui()

                with gr.Tab("Config"):
                    self.config_ui = ConfigUI().create_ui()

        return shortGptUI

    def launch(self):
        """Launch the server"""
        shortGptUI = self.create_interface()
        if not getattr(self, 'colab', False):
            print("\n\n********************* STARTING SHORGPT **********************")
            print("\nShortGPT is running here 👉 http://localhost:31415\n")
            print("********************* STARTING SHORGPT **********************\n\n")
        shortGptUI.queue().launch(
            server_port=31415,
            height=1000,
            allowed_paths=["public/", "videos/", "fonts/"],
            share=self.colab,
            server_name="0.0.0.0"
        )


if __name__ == "__main__":
    app = ShortGptUI()
    app.launch()


def signal_handler(sig, frame):
    print("Closing Gradio server...")
    gr.close_all()
    exit(0)

signal.signal(signal.SIGINT, signal_handler)
